import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A, isArray } from '@ember/array';
import { TrackedMap, TrackedObject } from 'tracked-built-ins';

/**
 * RegistryService
 * 
 * Fully dynamic, Map-based registry for storing categorized items.
 * Supports grouped registries with multiple list types per section.
 * 
 * Structure:
 * registries (TrackedMap) → section name → TrackedObject { list-name: A([]), ... }
 * 
 * Usage:
 * ```javascript
 * // Register an item to a specific list within a section
 * registryService.register('console:admin', 'menu-panels', 'fleet-ops', panelObject);
 * 
 * // Get all items from a list
 * const panels = registryService.getRegistry('console:admin', 'menu-panels');
 * 
 * // Lookup specific item
 * const panel = registryService.lookup('console:admin', 'menu-panels', 'fleet-ops');
 * ```
 * 
 * @class RegistryService
 * @extends Service
 */
export default class RegistryService extends Service {
    /**
     * TrackedMap of section name → TrackedObject with dynamic lists
     * Fully reactive - templates update when registries change
     * @type {TrackedMap<string, TrackedObject>}
     */
    registries = new TrackedMap();

    /**
     * Reference to the root Ember Application Instance.
     * Used for registering components/services to the application container
     * for cross-engine sharing.
     */
    @tracked applicationInstance = null;

    /**
     * Sets the root Ember Application Instance.
     * Called by an initializer to enable cross-engine registration.
     * @method setApplicationInstance
     * @param {Object} appInstance
     */
    setApplicationInstance(appInstance) {
        this.applicationInstance = appInstance;
    }

    /**
     * Get or create a registry section.
     * Returns a TrackedObject containing dynamic lists.
     * 
     * @method getOrCreateSection
     * @param {String} sectionName Section name (e.g., 'console:admin', 'dashboard:widgets')
     * @returns {TrackedObject} The section object
     */
    getOrCreateSection(sectionName) {
        if (!this.registries.has(sectionName)) {
            this.registries.set(sectionName, new TrackedObject({}));
        }
        return this.registries.get(sectionName);
    }

    /**
     * Get or create a list within a section.
     * Returns an Ember Array for the specified list.
     * 
     * @method getOrCreateList
     * @param {String} sectionName Section name
     * @param {String} listName List name (e.g., 'menu-items', 'menu-panels')
     * @returns {Array} The Ember Array for the list
     */
    getOrCreateList(sectionName, listName) {
        const section = this.getOrCreateSection(sectionName);
        
        if (!section[listName]) {
            section[listName] = A([]);
        }
        
        return section[listName];
    }

    /**
     * Register an item in a specific list within a registry section.
     * 
     * @method register
     * @param {String} sectionName Section name (e.g., 'console:admin')
     * @param {String} listName List name within the section (e.g., 'menu-items', 'menu-panels')
     * @param {String} key Unique identifier for the item
     * @param {Object} value The item to register
     */
    register(sectionName, listName, key, value) {
        const registry = this.getOrCreateList(sectionName, listName);

        // Store the key with the value for lookups
        if (typeof value === 'object' && value !== null) {
            value._registryKey = key;
        }

        // Check if already exists
        const existing = registry.find(item => {
            if (typeof item === 'object' && item !== null) {
                return item._registryKey === key || 
                       item.slug === key || 
                       item.id === key ||
                       item.widgetId === key;
            }
            return false;
        });

        if (existing) {
            // Update existing item
            const index = registry.indexOf(existing);
            registry.replace(index, 1, [value]);
        } else {
            // Add new item
            registry.pushObject(value);
        }
    }

    /**
     * Get all items from a specific list within a registry section.
     * 
     * @method getRegistry
     * @param {String} sectionName Section name (e.g., 'console:admin')
     * @param {String} listName List name within the section (e.g., 'menu-items', 'menu-panels')
     * @returns {Array} Array of items in the list
     */
    getRegistry(sectionName, listName) {
        const section = this.registries.get(sectionName);
        
        if (!section || !section[listName]) {
            return A([]);
        }
        
        return section[listName];
    }

    /**
     * Get the entire section object (all lists within a section).
     * 
     * @method getSection
     * @param {String} sectionName Section name
     * @returns {TrackedObject|null} The section object or null
     */
    getSection(sectionName) {
        return this.registries.get(sectionName) || null;
    }

    /**
     * Lookup a specific item by key
     * 
     * @method lookup
     * @param {String} sectionName Section name (e.g., 'console:admin')
     * @param {String} listName List name within the section (e.g., 'menu-items', 'menu-panels')
     * @param {String} key Item key
     * @returns {Object|null} The item or null if not found
     */
    lookup(sectionName, listName, key) {
        const registry = this.getRegistry(sectionName, listName);
        return registry.find(item => {
            if (typeof item === 'object' && item !== null) {
                return item._registryKey === key || 
                       item.slug === key || 
                       item.id === key ||
                       item.widgetId === key;
            }
            return false;
        }) || null;
    }

    /**
     * Get items matching a key prefix
     * 
     * @method getAllFromPrefix
     * @param {String} sectionName Section name (e.g., 'console:admin')
     * @param {String} listName List name within the section (e.g., 'menu-items')
     * @param {String} prefix Key prefix to match
     * @returns {Array} Matching items
     */
    getAllFromPrefix(sectionName, listName, prefix) {
        const registry = this.getRegistry(sectionName, listName);
        return registry.filter(item => {
            if (typeof item === 'object' && item !== null && item._registryKey) {
                return item._registryKey.startsWith(prefix);
            }
            return false;
        });
    }

    /**
     * Create a registry (section with default list).
     * For backward compatibility with existing code.
     * Creates a section with a 'menu-items' list by default.
     * 
     * @method createRegistry
     * @param {String} sectionName Section name
     * @returns {Array} The default list array
     */
    createRegistry(sectionName) {
        return this.getOrCreateList(sectionName, 'menu-items');
    }

    /**
     * Create multiple registries
     * 
     * @method createRegistries
     * @param {Array} sectionNames Array of section names
     */
    createRegistries(sectionNames) {
        if (isArray(sectionNames)) {
            sectionNames.forEach(sectionName => this.createRegistry(sectionName));
        }
    }

    /**
     * Create a registry section (or get existing).
     * This is a convenience method for explicitly creating sections.
     * 
     * @method createSection
     * @param {String} sectionName Section name
     * @returns {TrackedObject} The section object
     */
    createSection(sectionName) {
        return this.getOrCreateSection(sectionName);
    }

    /**
     * Create multiple registry sections
     * 
     * @method createSections
     * @param {Array} sectionNames Array of section names
     */
    createSections(sectionNames) {
        if (isArray(sectionNames)) {
            sectionNames.forEach(sectionName => this.createSection(sectionName));
        }
    }

    /**
     * Check if a section exists
     * 
     * @method hasSection
     * @param {String} sectionName Section name
     * @returns {Boolean} True if section exists
     */
    hasSection(sectionName) {
        return this.registries.has(sectionName);
    }

    /**
     * Check if a list exists within a section
     * 
     * @method hasList
     * @param {String} sectionName Section name
     * @param {String} listName List name
     * @returns {Boolean} True if list exists
     */
    hasList(sectionName, listName) {
        const section = this.registries.get(sectionName);
        return !!(section && section[listName]);
    }

    /**
     * Clear a specific list within a section
     * 
     * @method clearList
     * @param {String} sectionName Section name
     * @param {String} listName List name
     */
    clearList(sectionName, listName) {
        const section = this.registries.get(sectionName);
        if (section && section[listName]) {
            section[listName].clear();
        }
    }

    /**
     * Clear an entire section (all lists)
     * 
     * @method clearSection
     * @param {String} sectionName Section name
     */
    clearSection(sectionName) {
        const section = this.registries.get(sectionName);
        if (section) {
            Object.keys(section).forEach(listName => {
                if (section[listName] && typeof section[listName].clear === 'function') {
                    section[listName].clear();
                }
            });
            this.registries.delete(sectionName);
        }
    }

    /**
     * Clear all registries
     * 
     * @method clearAll
     */
    clearAll() {
        this.registries.forEach((section, sectionName) => {
            Object.keys(section).forEach(listName => {
                if (section[listName] && typeof section[listName].clear === 'function') {
                    section[listName].clear();
                }
            });
        });
        this.registries.clear();
    }

    /**
     * Registers a component to the root application container.
     * This ensures the component is available to all engines and the host app.
     * @method registerComponent
     * @param {String} name The component name (e.g., 'my-component')
     * @param {Class} componentClass The component class
     * @param {Object} options Registration options (e.g., { singleton: true })
     */
    registerComponent(name, componentClass, options = {}) {
        if (this.applicationInstance) {
            this.applicationInstance.register(`component:${name}`, componentClass, options);
        } else {
            console.warn('Application instance not set on RegistryService. Cannot register component:', name);
        }
    }

    /**
     * Registers a service to the root application container.
     * This ensures the service is available to all engines and the host app.
     * @method registerService
     * @param {String} name The service name (e.g., 'my-service')
     * @param {Class} serviceClass The service class
     * @param {Object} options Registration options (e.g., { singleton: true })
     */
    registerService(name, serviceClass, options = {}) {
        if (this.applicationInstance) {
            this.applicationInstance.register(`service:${name}`, serviceClass, options);
        } else {
            console.warn('Application instance not set on RegistryService. Cannot register service:', name);
        }
    }


}

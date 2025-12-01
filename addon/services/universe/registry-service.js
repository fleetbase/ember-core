import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A, isArray } from '@ember/array';
import { TrackedMap } from 'tracked-built-ins';

/**
 * RegistryService
 * 
 * Simple, performant registry for storing categorized items.
 * Used for menu items, widgets, hooks, and other extension points.
 * 
 * Usage:
 * ```javascript
 * // Register an item
 * registryService.register('admin-panel', 'fleet-ops', panelObject);
 * 
 * // Get all items in a category
 * const panels = registryService.getRegistry('admin-panel');
 * 
 * // Lookup specific item
 * const panel = registryService.lookup('admin-panel', 'fleet-ops');
 * ```
 * 
 * @class RegistryService
 * @extends Service
 */
export default class RegistryService extends Service {
    /**
     * Fixed, grouped registries as requested by the user.
     * Each property is a tracked object containing Ember Arrays (A([])) for reactivity.
     */
    @tracked consoleAdminRegistry = {
        menuItems: A([]),
        menuPanels: A([]),
    };

    @tracked consoleAccountRegistry = {
        menuItems: A([]),
        menuPanels: A([]),
    };

    @tracked consoleSettingsRegistry = {
        menuItems: A([]),
        menuPanels: A([]),
    };

    @tracked dashboardWidgets = {
        defaultWidgets: A([]),
        widgets: A([]),
    };

    /**
     * Fallback for dynamic registries not explicitly defined.
     * @type {TrackedMap<string, Ember.Array>}
     */
    @tracked dynamicRegistries = new TrackedMap();

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
     * Helper to get the correct registry section object.
     * @param {String} sectionName e.g., 'console:admin', 'dashboard:widgets'
     * @returns {Object|null} The tracked registry object or null.
     */
    getRegistrySection(sectionName) {
        switch (sectionName) {
            case 'console:admin':
                return this.consoleAdminRegistry;
            case 'console:account':
                return this.consoleAccountRegistry;
            case 'console:settings':
                return this.consoleSettingsRegistry;
            case 'dashboard:widgets':
                return this.dashboardWidgets;
            default:
                return null;
        }
    }

    /**
     * Register an item in a specific list within a registry section.
     * 
     * @method register
     * @param {String} sectionName Section name (e.g., 'console:admin')
     * @param {String} listName List name within the section (e.g., 'menuItems', 'menuPanels')
     * @param {String} key Unique identifier for the item
     * @param {Object} value The item to register
     */
    register(sectionName, listName, key, value) {
        const section = this.getRegistrySection(sectionName);
        let registry = section ? section[listName] : null;

        // Fallback to dynamic registries if not a fixed section
        if (!registry) {
            registry = this.dynamicRegistries.get(sectionName);
            if (!registry) {
                registry = A([]);
                this.dynamicRegistries.set(sectionName, registry);
            }
        }

        // If it's a fixed registry, we expect the listName to exist
        if (section && !registry) {
            console.warn(`Registry list '${listName}' not found in section '${sectionName}'. Item not registered.`);
            return;
        }

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
     * @param {String} listName List name within the section (e.g., 'menuItems', 'menuPanels')
     * @returns {Array} Array of items in the list, or dynamic registry if listName is null.
     */
    getRegistry(sectionName, listName = null) {
        const section = this.getRegistrySection(sectionName);
        
        if (section && listName) {
            return section[listName] || A([]);
        }

        // Fallback for dynamic registries
        return this.dynamicRegistries.get(sectionName) || A([]);
    }

    /**
     * Lookup a specific item by key
     * 
     * @method lookup
     * @param {String} sectionName Section name (e.g., 'console:admin')
     * @param {String} listName List name within the section (e.g., 'menuItems', 'menuPanels')
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
     * @param {String} listName List name within the section (e.g., 'menuItems', 'menuPanels')
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
     * Create a dynamic registry (or get existing)
     * 
     * @method createRegistry
     * @param {String} sectionName Section name
     * @returns {Array} The registry array
     */
    createRegistry(sectionName) {
        if (!this.dynamicRegistries.has(sectionName)) {
            this.dynamicRegistries.set(sectionName, A([]));
        }
        return this.dynamicRegistries.get(sectionName);
    }

    /**
     * Create multiple dynamic registries
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
     * Check if a registry section exists (fixed or dynamic)
     * 
     * @method hasRegistry
     * @param {String} sectionName Section name
     * @returns {Boolean} True if registry exists
     */
    hasRegistry(sectionName) {
        return !!this.getRegistrySection(sectionName) || this.dynamicRegistries.has(sectionName);
    }

    /**
     * Clear a registry list or dynamic registry.
     * 
     * @method clearRegistry
     * @param {String} sectionName Section name
     * @param {String} listName Optional list name
     */
    clearRegistry(sectionName, listName = null) {
        const section = this.getRegistrySection(sectionName);
        
        if (section && listName && section[listName]) {
            section[listName].clear();
        } else if (this.dynamicRegistries.has(sectionName)) {
            this.dynamicRegistries.get(sectionName).clear();
            this.dynamicRegistries.delete(sectionName);
        }
    }

    /**
     * Clear all registries (fixed and dynamic)
     * 
     * @method clearAll
     */
    clearAll() {
        // Clear fixed registries
        this.consoleAdminRegistry.menuItems.clear();
        this.consoleAdminRegistry.menuPanels.clear();
        this.consoleAccountRegistry.menuItems.clear();
        this.consoleAccountRegistry.menuPanels.clear();
        this.consoleSettingsRegistry.menuItems.clear();
        this.consoleSettingsRegistry.menuPanels.clear();
        this.dashboardWidgets.defaultWidgets.clear();
        this.dashboardWidgets.widgets.clear();

        // Clear dynamic registries
        this.dynamicRegistries.forEach(registry => registry.clear());
        this.dynamicRegistries.clear();
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

    /**
     * Registers a utility or value to the root application container.
     * @method registerUtil
     * @param {String} name The utility name (e.g., 'my-util')
     * @param {*} value The value to register
     * @param {Object} options Registration options
     */
    registerUtil(name, value, options = {}) {
        if (this.applicationInstance) {
            this.applicationInstance.register(`util:${name}`, value, options);
        } else {
            console.warn('Application instance not set on RegistryService. Cannot register utility:', name);
        }
    }
}

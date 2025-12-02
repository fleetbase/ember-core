import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { warn } from '@ember/debug';
import { A, isArray } from '@ember/array';
import { TrackedMap, TrackedObject } from 'tracked-built-ins';
import { getOwner } from '@ember/application';
import TemplateHelper from '../../models/template-helper';

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
     * Register a renderable component for cross-engine rendering
     * Supports both ExtensionComponent definitions and raw component classes
     * 
     * @method registerRenderableComponent
     * @param {String} registryName Registry name (slot identifier)
     * @param {Object|Class|Array} component ExtensionComponent definition, component class, or array of either
     * @param {Object} options Optional configuration
     * @param {String} options.engineName Engine name (required for raw component classes)
     * 
     * @example
     * // ExtensionComponent definition with path (lazy loading)
     * registryService.registerRenderableComponent(
     *     'fleet-ops:component:order:details',
     *     new ExtensionComponent('@fleetbase/storefront-engine', 'storefront-order-summary')
     * );
     * 
     * @example
     * // ExtensionComponent definition with class (immediate)
     * import MyComponent from './components/my-component';
     * registryService.registerRenderableComponent(
     *     'fleet-ops:component:order:details',
     *     new ExtensionComponent('@fleetbase/fleetops-engine', MyComponent)
     * );
     * 
     * @example
     * // Raw component class (requires engineName in options)
     * registryService.registerRenderableComponent(
     *     'fleet-ops:component:order:details',
     *     MyComponent,
     *     { engineName: '@fleetbase/fleetops-engine' }
     * );
     */
    registerRenderableComponent(registryName, component, options = {}) {
        // Handle arrays
        if (isArray(component)) {
            component.forEach((comp) => this.registerRenderableComponent(registryName, comp, options));
            return;
        }

        // Generate unique key for the component
        const key = component._registryKey || 
                    component.name || 
                    component.path ||
                    `component-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Register to RegistryService using map-based structure
        // Structure: registries.get(registryName).components = [component1, component2, ...]
        this.register(registryName, 'components', key, component);
    }

    /**
     * Get renderable components from a registry
     * 
     * @method getRenderableComponents
     * @param {String} registryName Registry name
     * @returns {Array} Array of component definitions/classes
     */
    getRenderableComponents(registryName) {
        return this.getRegistry(registryName, 'components');
    }

    /**
     * Create a registry (section with default list).
     * For backward compatibility with existing code.
     * Creates a section with a 'menu-item' list by default.
     * 
     * @method createRegistry
     * @param {String} sectionName Section name
     * @returns {Array} The default list array
     */
    createRegistry(sectionName) {
        return this.getOrCreateList(sectionName, 'menu-item');
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
            warn('Application instance not set on RegistryService. Cannot register component.', { id: 'registry-service.no-app-instance' });
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
            warn('Application instance not set on RegistryService. Cannot register service.', { id: 'registry-service.no-app-instance' });
        }
    }

    /**
     * Registers a helper to the root application container.
     * This makes the helper available globally to all engines and the host app.
     * Supports both direct helper functions/classes and lazy loading via TemplateHelper.
     * 
     * @method registerHelper
     * @param {String} helperName The helper name (e.g., 'calculate-delivery-fee')
     * @param {Function|Class|TemplateHelper} helperClassOrTemplateHelper Helper function, class, or TemplateHelper instance
     * @param {Object} options Registration options
     * @param {Boolean} options.instantiate Whether to instantiate the helper (default: false for functions)
     * 
     * @example
     * // Direct function registration
     * registryService.registerHelper('calculate-delivery-fee', calculateDeliveryFeeHelper);
     * 
     * @example
     * // Direct class registration
     * registryService.registerHelper('format-currency', FormatCurrencyHelper);
     * 
     * @example
     * // Lazy loading from engine
     * registryService.registerHelper(
     *     'calculate-delivery-fee',
     *     new TemplateHelper('@fleetbase/storefront-engine', 'helpers/calculate-delivery-fee')
     * );
     */
    registerHelper(helperName, helperClassOrTemplateHelper, options = {}) {
        const owner = this.applicationInstance || getOwner(this);
        
        if (!owner) {
            warn('No owner available for helper registration. Cannot register helper.', { 
                id: 'registry-service.no-owner' 
            });
            return;
        }

        // Check if it's a TemplateHelper instance
        if (helperClassOrTemplateHelper instanceof TemplateHelper) {
            const templateHelper = helperClassOrTemplateHelper;
            
            if (templateHelper.isClass) {
                // Direct class registration from TemplateHelper
                owner.register(`helper:${helperName}`, templateHelper.class, {
                    instantiate: options.instantiate !== undefined ? options.instantiate : true
                });
            } else {
                // Lazy loading from engine
                const helper = this.#loadHelperFromEngine(templateHelper);
                if (helper) {
                    owner.register(`helper:${helperName}`, helper, {
                        instantiate: options.instantiate !== undefined ? options.instantiate : true
                    });
                } else {
                    warn(`Failed to load helper from engine: ${templateHelper.engineName}/${templateHelper.path}`, {
                        id: 'registry-service.helper-load-failed'
                    });
                }
            }
        } else {
            // Direct function or class registration
            const instantiate = options.instantiate !== undefined 
                ? options.instantiate 
                : (typeof helperClassOrTemplateHelper !== 'function' || helperClassOrTemplateHelper.prototype);
            
            owner.register(`helper:${helperName}`, helperClassOrTemplateHelper, {
                instantiate
            });
        }
    }

    /**
     * Loads a helper from an engine using TemplateHelper definition.
     * @private
     * @method #loadHelperFromEngine
     * @param {TemplateHelper} templateHelper The TemplateHelper instance
     * @returns {Function|Class|null} The loaded helper or null if failed
     */
    #loadHelperFromEngine(templateHelper) {
        const owner = this.applicationInstance || getOwner(this);
        
        if (!owner) {
            return null;
        }

        try {
            // Get the engine instance
            const engineInstance = owner.lookup(`engine:${templateHelper.engineName}`);
            
            if (!engineInstance) {
                warn(`Engine not found: ${templateHelper.engineName}`, {
                    id: 'registry-service.engine-not-found'
                });
                return null;
            }

            // Try to resolve the helper from the engine
            const helperPath = templateHelper.path.startsWith('helper:') 
                ? templateHelper.path 
                : `helper:${templateHelper.path}`;
            
            const helper = engineInstance.resolveRegistration(helperPath);
            
            if (!helper) {
                warn(`Helper not found in engine: ${helperPath}`, {
                    id: 'registry-service.helper-not-found'
                });
                return null;
            }

            return helper;
        } catch (error) {
            warn(`Error loading helper from engine: ${error.message}`, {
                id: 'registry-service.helper-load-error'
            });
            return null;
        }
    }


}

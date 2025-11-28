import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A, isArray } from '@ember/array';
import { getOwner } from '@ember/application';
import { dasherize } from '@ember/string';

/**
 * RegistryService
 * 
 * Manages all registries in the application using Ember's container system.
 * Provides O(1) lookup performance and follows Ember conventions.
 * 
 * This service handles two types of registrations:
 * 
 * 1. **Ember Native Types** (component, service, helper, modifier, etc.)
 *    - Follows Ember's standard naming: `component:my-component`
 *    - No modification to the key, preserves Ember conventions
 *    - Enables cross-engine sharing of components/services
 * 
 * 2. **Custom Registries** (menu-item, widget, hook, etc.)
 *    - Uses '#' separator for categorization: `menu-item:header#fleet-ops`
 *    - Allows hierarchical organization within our custom types
 * 
 * Examples:
 * - Native: `component:vehicle-form` (unchanged)
 * - Native: `service:universe` (unchanged)
 * - Custom: `menu-item:header#fleet-ops` (hash for category)
 * - Custom: `widget:dashboard#metrics` (hash for category)
 * 
 * @class RegistryService
 * @extends Service
 */
export default class RegistryService extends Service {
    @tracked registries = new Map();

    /**
     * Ember native type names that should not be modified
     * These follow Ember's standard container naming conventions
     */
    EMBER_NATIVE_TYPES = [
        'component',
        'service',
        'helper',
        'modifier',
        'route',
        'controller',
        'template',
        'model',
        'adapter',
        'serializer',
        'transform',
        'initializer',
        'instance-initializer'
    ];

    /**
     * Create a new registry
     * 
     * @method createRegistry
     * @param {String} name Registry name
     * @returns {Array} The created registry
     */
    createRegistry(name) {
        if (!this.registries.has(name)) {
            this.registries.set(name, A([]));
        }
        return this.registries.get(name);
    }

    /**
     * Create multiple registries
     * 
     * @method createRegistries
     * @param {Array} names Array of registry names
     */
    createRegistries(names) {
        if (isArray(names)) {
            names.forEach(name => this.createRegistry(name));
        }
    }

    /**
     * Check if a registry name is an Ember native type
     * 
     * @private
     * @method #isEmberNativeType
     * @param {String} registryName The registry name to check
     * @returns {Boolean} True if it's an Ember native type
     */
    #isEmberNativeType(registryName) {
        return this.EMBER_NATIVE_TYPES.includes(registryName);
    }

    /**
     * Normalize a key to be Ember container-safe
     * 
     * For Ember native types (component, service, etc.): preserves the key as-is (dasherized)
     * For custom registries: replaces colons with hash for categorization
     * 
     * @private
     * @method #normalizeKey
     * @param {String} registryName The registry name
     * @param {String} key The key to normalize
     * @returns {String} Normalized key
     */
    #normalizeKey(registryName, key) {
        const dasherizedKey = dasherize(String(key));
        
        // For Ember native types, don't modify the key (keep Ember conventions)
        if (this.#isEmberNativeType(registryName)) {
            return dasherizedKey;
        }
        
        // For custom registries, replace colons with hash for categorization
        return dasherizedKey.replace(/:/g, '#');
    }

    /**
     * Build a valid Ember container name
     * Format: type:name where type is the registry name and name is the normalized key
     * 
     * @private
     * @method #buildContainerName
     * @param {String} registryName Registry name (becomes the type)
     * @param {String} key Item key (becomes the name)
     * @returns {String} Valid Ember container name
     */
    #buildContainerName(registryName, key) {
        const normalizedRegistry = dasherize(registryName);
        const normalizedKey = this.#normalizeKey(registryName, key);
        return `${normalizedRegistry}:${normalizedKey}`;
    }

    /**
     * Register an item to a registry
     * 
     * @method register
     * @param {String} registryName Registry name
     * @param {String} key Item key
     * @param {*} value Item value
     */
    register(registryName, key, value) {
        const owner = getOwner(this);
        const fullName = this.#buildContainerName(registryName, key);

        // Register in Ember's container for O(1) lookup
        if (owner && owner.register) {
            owner.register(fullName, value, { instantiate: false });
        }

        // Also maintain in our registry for iteration
        const registry = this.createRegistry(registryName);
        
        // Store the registration key with the value for filtering
        // This allows filtering by key prefix (e.g., 'default#dashboard#')
        if (typeof value === 'object' && value !== null) {
            value._registryKey = key;
        }
        
        // Check if already exists and update, otherwise add
        const existing = registry.find(item => {
            if (typeof item === 'object' && item !== null) {
                return item._registryKey === key || item.slug === key || item.widgetId === key || item.id === key;
            }
            return false;
        });

        if (existing) {
            const index = registry.indexOf(existing);
            registry.replace(index, 1, [value]);
        } else {
            registry.pushObject(value);
        }
    }

    /**
     * Lookup an item from a registry
     * 
     * @method lookup
     * @param {String} registryName Registry name
     * @param {String} key Item key
     * @returns {*} The registered item
     */
    lookup(registryName, key) {
        const owner = getOwner(this);
        const fullName = this.#buildContainerName(registryName, key);

        if (owner && owner.lookup) {
            const result = owner.lookup(fullName);
            if (result !== undefined) {
                return result;
            }
        }

        // Fallback to registry search
        const registry = this.registries.get(registryName);
        if (registry) {
            return registry.find(item => {
                if (typeof item === 'object' && item !== null) {
                    return item.slug === key || item.widgetId === key || item.id === key;
                }
                return false;
            });
        }

        return null;
    }

    /**
     * Get all items from a registry
     * 
     * @method getRegistry
     * @param {String} name Registry name
     * @returns {Array} Registry items
     */
    getRegistry(name) {
        return this.registries.get(name) || A([]);
    }

    /**
     * Get all items from a registry that match a key prefix
     * Useful for getting items like 'header:*', 'organization:*', etc.
     * 
     * @method getAllFromPrefix
     * @param {String} registryName Registry name (e.g., 'menu-item')
     * @param {String} keyPrefix Key prefix to match (e.g., 'header:')
     * @returns {Array} Matching items
     */
    getAllFromPrefix(registryName, keyPrefix) {
        const registry = this.getRegistry(registryName);
        const normalizedPrefix = this.#normalizeKey(registryName, keyPrefix);
        
        return registry.filter(item => {
            if (typeof item === 'object' && item !== null && item._registryKey) {
                const normalizedItemKey = this.#normalizeKey(registryName, item._registryKey);
                return normalizedItemKey.startsWith(normalizedPrefix);
            }
            return false;
        });
    }

    /**
     * Check if a registry exists
     * 
     * @method hasRegistry
     * @param {String} name Registry name
     * @returns {Boolean} True if registry exists
     */
    hasRegistry(name) {
        return this.registries.has(name);
    }

    /**
     * Remove an item from a registry
     * 
     * @method unregister
     * @param {String} registryName Registry name
     * @param {String} key Item key
     */
    unregister(registryName, key) {
        const owner = getOwner(this);
        const fullName = this.#buildContainerName(registryName, key);

        if (owner && owner.unregister) {
            owner.unregister(fullName);
        }

        const registry = this.registries.get(registryName);
        if (registry) {
            const item = registry.find(item => {
                if (typeof item === 'object' && item !== null) {
                    return item.slug === key || item.widgetId === key || item.id === key;
                }
                return false;
            });

            if (item) {
                registry.removeObject(item);
            }
        }
    }

    /**
     * Clear a registry
     * 
     * @method clearRegistry
     * @param {String} name Registry name
     */
    clearRegistry(name) {
        const registry = this.registries.get(name);
        if (registry) {
            registry.clear();
        }
    }

    /**
     * Clear all registries
     * 
     * @method clearAll
     */
    clearAll() {
        this.registries.forEach(registry => registry.clear());
        this.registries.clear();
    }
}

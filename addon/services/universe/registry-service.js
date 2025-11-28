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
    @tracked registries;

    /**
     * Initialize the service and get/create shared registries Map
     * 
     * The registries Map is stored in the application container so that
     * all engines share the same registries. This enables cross-engine access.
     */
    constructor() {
        super(...arguments);
        const owner = getOwner(this);
        
        // Try to get shared registries from container
        let sharedRegistries = owner.lookup('fleetbase:registries');
        
        if (!sharedRegistries) {
            // First time - create and register in container
            sharedRegistries = new Map();
            owner.register('fleetbase:registries', sharedRegistries, {
                instantiate: false,
                singleton: true
            });
        }
        
        // Use the shared Map
        this.registries = sharedRegistries;
    }

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

        // Register in Ember's container (source of truth)
        if (owner && owner.register) {
            owner.register(fullName, value, { instantiate: false });
        }

        // Maintain key index for iteration/filtering
        const keyRegistry = this.createRegistry(registryName);
        
        // Only store the key, not the full object
        // The Map acts as an index/query layer
        if (!keyRegistry.includes(key)) {
            keyRegistry.pushObject(key);
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
     * Looks up keys from the index Map, then fetches actual values from container.
     * This ensures container is the single source of truth.
     * 
     * @method getRegistry
     * @param {String} name Registry name
     * @returns {Array} Registry items
     */
    getRegistry(name) {
        const keys = this.registries.get(name) || A([]);
        const owner = getOwner(this);
        
        // Lookup each key from container
        return A(keys.map(key => {
            const fullName = this.#buildContainerName(name, key);
            return owner.lookup(fullName);
        }).filter(Boolean)); // Filter out any null/undefined lookups
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
        const keys = this.registries.get(registryName) || A([]);
        const normalizedPrefix = this.#normalizeKey(registryName, keyPrefix);
        const owner = getOwner(this);
        
        // Filter keys by prefix, then lookup from container
        const matchingKeys = keys.filter(key => {
            const normalizedKey = this.#normalizeKey(registryName, key);
            return normalizedKey.startsWith(normalizedPrefix);
        });
        
        return A(matchingKeys.map(key => {
            const fullName = this.#buildContainerName(registryName, key);
            return owner.lookup(fullName);
        }).filter(Boolean));
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

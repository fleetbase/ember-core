import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A, isArray } from '@ember/array';
import { getOwner } from '@ember/application';

/**
 * RegistryService
 * 
 * Manages all registries in the application using Ember's container system.
 * Provides O(1) lookup performance and follows Ember conventions.
 * 
 * @class RegistryService
 * @extends Service
 */
export default class RegistryService extends Service {
    @tracked registries = new Map();

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
     * Register an item to a registry
     * 
     * @method register
     * @param {String} registryName Registry name
     * @param {String} key Item key
     * @param {*} value Item value
     */
    register(registryName, key, value) {
        const owner = getOwner(this);
        const fullName = `${registryName}:${key}`;

        // Register in Ember's container for O(1) lookup
        if (owner && owner.register) {
            owner.register(fullName, value, { instantiate: false });
        }

        // Also maintain in our registry for iteration
        const registry = this.createRegistry(registryName);
        
        // Check if already exists and update, otherwise add
        const existing = registry.find(item => {
            if (typeof item === 'object' && item !== null) {
                return item.slug === key || item.widgetId === key || item.id === key;
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
        const fullName = `${registryName}:${key}`;

        if (owner && owner.lookup) {
            return owner.lookup(fullName);
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
        const fullName = `${registryName}:${key}`;

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

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
     * TrackedMap of category name → Ember Array of items
     * Automatically reactive - templates update when registries change
     */
    registries = new TrackedMap();

    /**
     * Register an item in a category
     * 
     * @method register
     * @param {String} category Category name (e.g., 'admin-panel', 'widget', 'menu-item')
     * @param {String} key Unique identifier for the item
     * @param {Object} value The item to register
     */
    register(category, key, value) {
        // Get or create registry for this category
        let registry = this.registries.get(category);
        if (!registry) {
            registry = A([]);
            this.registries.set(category, registry);
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
     * Get all items from a category
     * 
     * @method getRegistry
     * @param {String} category Category name
     * @returns {Array} Array of items in the category
     */
    getRegistry(category) {
        return this.registries.get(category) || A([]);
    }

    /**
     * Lookup a specific item by key
     * 
     * @method lookup
     * @param {String} category Category name
     * @param {String} key Item key
     * @returns {Object|null} The item or null if not found
     */
    lookup(category, key) {
        const registry = this.getRegistry(category);
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
     * @param {String} category Category name
     * @param {String} prefix Key prefix to match
     * @returns {Array} Matching items
     */
    getAllFromPrefix(category, prefix) {
        const registry = this.getRegistry(category);
        return registry.filter(item => {
            if (typeof item === 'object' && item !== null && item._registryKey) {
                return item._registryKey.startsWith(prefix);
            }
            return false;
        });
    }

    /**
     * Create a registry (or get existing)
     * 
     * @method createRegistry
     * @param {String} category Category name
     * @returns {Array} The registry array
     */
    createRegistry(category) {
        if (!this.registries.has(category)) {
            this.registries.set(category, A([]));
        }
        return this.registries.get(category);
    }

    /**
     * Create multiple registries
     * 
     * @method createRegistries
     * @param {Array} categories Array of category names
     */
    createRegistries(categories) {
        if (isArray(categories)) {
            categories.forEach(category => this.createRegistry(category));
        }
    }

    /**
     * Check if a category exists
     * 
     * @method hasRegistry
     * @param {String} category Category name
     * @returns {Boolean} True if category exists
     */
    hasRegistry(category) {
        return this.registries.has(category);
    }

    /**
     * Clear a category
     * 
     * @method clearRegistry
     * @param {String} category Category name
     */
    clearRegistry(category) {
        if (this.registries.has(category)) {
            this.registries.get(category).clear();
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

import BaseContract from './base-contract';
import { guidFor } from '@ember/object/internals';
import isObject from '../utils/is-object';

/**
 * Represents a lifecycle or application hook
 * 
 * Hooks allow extensions to inject custom logic at specific points in the application lifecycle.
 * 
 * @class Hook
 * @extends BaseContract
 * 
 * @example
 * // Simple hook with chaining
 * new Hook('application:before-model', (session, router) => {
 *   if (session.isCustomer) {
 *     router.transitionTo('customer-portal');
 *   }
 * })
 * 
 * @example
 * // Full definition object (first-class)
 * new Hook({
 *   name: 'application:before-model',
 *   handler: (session, router) => {
 *     if (session.isCustomer) {
 *       router.transitionTo('customer-portal');
 *     }
 *   },
 *   priority: 10,
 *   once: false,
 *   id: 'customer-redirect'
 * })
 * 
 * @example
 * // Hook with method chaining
 * new Hook('order:before-save')
 *   .withPriority(10)
 *   .once()
 *   .execute(async (order) => {
 *     await validateOrder(order);
 *   })
 */
export default class Hook extends BaseContract {
    /**
     * Create a new Hook
     * 
     * @constructor
     * @param {String|Object} nameOrDefinition Hook name or full definition object
     * @param {Function} handlerOrOptions Handler function or options object (only used if first param is string)
     */
    constructor(nameOrDefinition, handlerOrOptions = null) {
        // Initialize properties BEFORE calling super to avoid validation errors
        let initialOptions = {};
        
        // Handle full definition object as first-class
        if (isObject(nameOrDefinition) && nameOrDefinition.name) {
            const definition = nameOrDefinition;
            
            this.name = definition.name;
            this.handler = definition.handler || null;
            this.priority = definition.priority !== undefined ? definition.priority : 0;
            this.runOnce = definition.once || false;
            this.id = definition.id || guidFor(this);
            this.enabled = definition.enabled !== undefined ? definition.enabled : true;
            
            initialOptions = { ...definition };
        } else {
            // Handle string name with optional handler (chaining pattern)
            const options = typeof handlerOrOptions === 'function'
                ? { handler: handlerOrOptions }
                : (handlerOrOptions || {});

            this.name = nameOrDefinition;
            this.handler = options.handler || null;
            this.priority = options.priority || 0;
            this.runOnce = options.once || false;
            this.id = options.id || guidFor(this);
            this.enabled = options.enabled !== undefined ? options.enabled : true;
            
            initialOptions = { name: this.name, ...options };
        }
        
        // Now call super with all properties set
        super(initialOptions);
    }

    /**
     * Validate the hook
     * 
     * @method validate
     * @throws {Error} If name is missing
     */
    validate() {
        if (!this.name) {
            throw new Error('Hook requires a name');
        }
    }

    /**
     * Set the hook handler function
     * 
     * @method execute
     * @param {Function} handler The handler function
     * @returns {Hook} This instance for chaining
     */
    execute(handler) {
        this.handler = handler;
        this._options.handler = handler;
        return this;
    }

    /**
     * Set the hook priority
     * Lower numbers execute first
     * 
     * @method withPriority
     * @param {Number} priority Priority value
     * @returns {Hook} This instance for chaining
     */
    withPriority(priority) {
        this.priority = priority;
        this._options.priority = priority;
        return this;
    }

    /**
     * Mark this hook to run only once
     * After execution, it will be automatically removed
     * 
     * @method once
     * @returns {Hook} This instance for chaining
     */
    once() {
        this.runOnce = true;
        this._options.once = true;
        return this;
    }

    /**
     * Set a unique ID for this hook
     * Useful for removing specific hooks later
     * 
     * @method withId
     * @param {String} id Unique identifier
     * @returns {Hook} This instance for chaining
     */
    withId(id) {
        this.id = id;
        this._options.id = id;
        return this;
    }

    /**
     * Enable or disable the hook
     * 
     * @method setEnabled
     * @param {Boolean} enabled Whether the hook is enabled
     * @returns {Hook} This instance for chaining
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        this._options.enabled = enabled;
        return this;
    }

    /**
     * Disable the hook
     * 
     * @method disable
     * @returns {Hook} This instance for chaining
     */
    disable() {
        return this.setEnabled(false);
    }

    /**
     * Enable the hook
     * 
     * @method enable
     * @returns {Hook} This instance for chaining
     */
    enable() {
        return this.setEnabled(true);
    }

    /**
     * Add metadata to the hook
     * 
     * @method withMetadata
     * @param {Object} metadata Metadata object
     * @returns {Hook} This instance for chaining
     */
    withMetadata(metadata) {
        this._options.metadata = metadata;
        return this;
    }

    /**
     * Get the plain object representation
     * 
     * @method toObject
     * @returns {Object} Plain object with all hook properties
     */
    toObject() {
        return {
            name: this.name,
            handler: this.handler,
            priority: this.priority,
            once: this.runOnce,
            id: this.id,
            enabled: this.enabled,
            ...this._options
        };
    }
}

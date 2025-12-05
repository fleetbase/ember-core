import BaseContract from './base-contract';

/**
 * Represents a registry namespace
 *
 * Registries provide namespaced storage for components and other resources
 * that can be dynamically rendered or accessed by extensions.
 *
 * @class Registry
 * @extends BaseContract
 *
 * @example
 * new Registry('fleet-ops:component:vehicle:details')
 *
 * @example
 * new Registry('fleet-ops')
 *   .withNamespace('component')
 *   .withSubNamespace('vehicle:details')
 */
export default class Registry extends BaseContract {
    /**
     * Create a new Registry
     *
     * @constructor
     * @param {String} name Registry name
     */
    constructor(name) {
        super({ name });
        this.name = name;
    }

    /**
     * Validate the registry
     *
     * @method validate
     * @throws {Error} If name is missing
     */
    validate() {
        if (!this.name) {
            throw new Error('Registry requires a name');
        }
    }

    /**
     * Add a namespace to the registry name
     *
     * @method withNamespace
     * @param {String} namespace Namespace to add
     * @returns {Registry} This instance for chaining
     */
    withNamespace(namespace) {
        this.name = `${this.name}:${namespace}`;
        this._options.name = this.name;
        return this;
    }

    /**
     * Add a sub-namespace to the registry name
     *
     * @method withSubNamespace
     * @param {String} subNamespace Sub-namespace to add
     * @returns {Registry} This instance for chaining
     */
    withSubNamespace(subNamespace) {
        this.name = `${this.name}:${subNamespace}`;
        this._options.name = this.name;
        return this;
    }

    /**
     * Get the plain object representation
     *
     * @method toObject
     * @returns {Object} Plain object with registry name
     */
    toObject() {
        return {
            name: this.name,
            ...this._options,
        };
    }

    /**
     * Get string representation of the registry
     *
     * @method toString
     * @returns {String} Registry name
     */
    toString() {
        return this.name;
    }
}

import { tracked } from '@glimmer/tracking';

/**
 * Base class for all extension contracts
 * Provides common functionality for validation, serialization, and option management
 * 
 * @class BaseContract
 */
export default class BaseContract {
    @tracked _options = {};

    constructor(options = {}) {
        this._options = { ...options };
        this.validate();
    }

    /**
     * Validate the contract
     * Override in subclasses to add specific validation logic
     * 
     * @method validate
     */
    validate() {
        // Base validation - override in subclasses
    }

    /**
     * Get the plain object representation of this contract
     * 
     * @method toObject
     * @returns {Object} Plain object representation
     */
    toObject() {
        return { ...this._options };
    }

    /**
     * Set an option with method chaining support
     * 
     * @method setOption
     * @param {String} key The option key
     * @param {*} value The option value
     * @returns {BaseContract} This instance for chaining
     */
    setOption(key, value) {
        this._options[key] = value;
        return this;
    }

    /**
     * Get an option value
     * 
     * @method getOption
     * @param {String} key The option key
     * @param {*} defaultValue Default value if option doesn't exist
     * @returns {*} The option value or default
     */
    getOption(key, defaultValue = null) {
        return this._options[key] !== undefined ? this._options[key] : defaultValue;
    }

    /**
     * Check if an option exists
     * 
     * @method hasOption
     * @param {String} key The option key
     * @returns {Boolean} True if option exists
     */
    hasOption(key) {
        return this._options[key] !== undefined;
    }

    /**
     * Remove an option
     * 
     * @method removeOption
     * @param {String} key The option key
     * @returns {BaseContract} This instance for chaining
     */
    removeOption(key) {
        delete this._options[key];
        return this;
    }

    /**
     * Get all options
     * 
     * @method getOptions
     * @returns {Object} All options
     */
    getOptions() {
        return { ...this._options };
    }
}

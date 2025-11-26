import BaseContract from './base-contract';

/**
 * Represents a lazy-loadable component from an engine
 * 
 * This contract defines a component that will be loaded on-demand from an engine,
 * preserving lazy loading capabilities while allowing cross-engine component usage.
 * 
 * @class ExtensionComponent
 * @extends BaseContract
 * 
 * @example
 * // Simple usage
 * new ExtensionComponent('@fleetbase/fleetops-engine', 'components/admin/navigator-app')
 * 
 * @example
 * // With options
 * new ExtensionComponent('@fleetbase/fleetops-engine', {
 *   path: 'components/admin/navigator-app',
 *   loadingComponent: 'loading-spinner',
 *   errorComponent: 'error-display'
 * })
 * 
 * @example
 * // With method chaining
 * new ExtensionComponent('@fleetbase/fleetops-engine', 'components/widget/metrics')
 *   .withLoadingComponent('skeletons/widget')
 *   .withErrorComponent('error-boundary')
 *   .withData({ refreshInterval: 5000 })
 */
export default class ExtensionComponent extends BaseContract {
    /**
     * Create a new ExtensionComponent
     * 
     * @constructor
     * @param {String} engineName The name of the engine (e.g., '@fleetbase/fleetops-engine')
     * @param {String|Object} pathOrOptions Component path or options object
     */
    constructor(engineName, pathOrOptions = {}) {
        const options = typeof pathOrOptions === 'string' 
            ? { path: pathOrOptions }
            : pathOrOptions;

        super({
            engine: engineName,
            ...options
        });

        this.engine = engineName;
        this.path = options.path;
        this.loadingComponent = options.loadingComponent || null;
        this.errorComponent = options.errorComponent || null;
    }

    /**
     * Validate the component definition
     * 
     * @method validate
     * @throws {Error} If engine name or path is missing
     */
    validate() {
        if (!this.engine) {
            throw new Error('ExtensionComponent requires an engine name');
        }
        if (!this.path) {
            throw new Error('ExtensionComponent requires a component path');
        }
    }

    /**
     * Set a custom loading component to display while the engine loads
     * 
     * @method withLoadingComponent
     * @param {String} componentName Name of the loading component
     * @returns {ExtensionComponent} This instance for chaining
     */
    withLoadingComponent(componentName) {
        this.loadingComponent = componentName;
        this._options.loadingComponent = componentName;
        return this;
    }

    /**
     * Set a custom error component to display if loading fails
     * 
     * @method withErrorComponent
     * @param {String} componentName Name of the error component
     * @returns {ExtensionComponent} This instance for chaining
     */
    withErrorComponent(componentName) {
        this.errorComponent = componentName;
        this._options.errorComponent = componentName;
        return this;
    }

    /**
     * Add custom data to pass to the component when it renders
     * 
     * @method withData
     * @param {Object} data Custom data object
     * @returns {ExtensionComponent} This instance for chaining
     */
    withData(data) {
        this._options.data = data;
        return this;
    }

    /**
     * Set a timeout for loading the component
     * 
     * @method withTimeout
     * @param {Number} milliseconds Timeout in milliseconds
     * @returns {ExtensionComponent} This instance for chaining
     */
    withTimeout(milliseconds) {
        this._options.timeout = milliseconds;
        return this;
    }

    /**
     * Get the plain object representation
     * 
     * @method toObject
     * @returns {Object} Plain object with all component definition properties
     */
    toObject() {
        return {
            engine: this.engine,
            path: this.path,
            loadingComponent: this.loadingComponent,
            errorComponent: this.errorComponent,
            ...this._options
        };
    }
}

import { tracked } from '@glimmer/tracking';
import { A } from '@ember/array';

/**
 * ExtensionBootState
 * 
 * Shared state object for extension booting process.
 * Registered as a singleton in the application container to ensure
 * all ExtensionManager instances (app and engines) share the same boot state.
 * 
 * @class ExtensionBootState
 */
export default class ExtensionBootState {
    /**
     * Whether extensions are currently booting
     * @type {boolean}
     */
    @tracked isBooting = true;

    /**
     * Promise that resolves when boot is complete
     * @type {Object|null}
     */
    @tracked bootPromise = null;

    /**
     * Promise that resolves when extensions are loaded
     * @type {Promise|null}
     */
    @tracked extensionsLoadedPromise = null;

    /**
     * Resolver function for extensionsLoadedPromise
     * @type {Function|null}
     */
    @tracked extensionsLoadedResolver = null;

    /**
     * Whether extensions have been loaded
     * @type {boolean}
     */
    @tracked extensionsLoaded = false;

    /**
     * Map of loaded engine instances
     * @type {Map}
     */
    @tracked loadedEngines = new Map();

    /**
     * Array of registered extensions
     * @type {Array}
     */
    @tracked registeredExtensions = A([]);

    /**
     * Map of loading promises for engines
     * @type {Map}
     */
    @tracked loadingPromises = new Map();

    /**
     * Map of engine loaded hooks
     * @type {Map}
     */
    engineLoadedHooks = new Map();
}

import { tracked } from '@glimmer/tracking';

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
}

import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A } from '@ember/array';
import { getOwner } from '@ember/application';
import { assert } from '@ember/debug';
import loadExtensions from '@fleetbase/ember-core/utils/load-extensions';
import mapEngines from '@fleetbase/ember-core/utils/map-engines';

/**
 * ExtensionManagerService
 * 
 * Manages lazy loading of engines and extension lifecycle.
 * Replaces the old bootEngines mechanism with on-demand loading.
 * 
 * @class ExtensionManagerService
 * @extends Service
 */
export default class ExtensionManagerService extends Service {
    @tracked loadedEngines = new Map();
    @tracked registeredExtensions = A([]);
    @tracked loadingPromises = new Map();
    @tracked isBooting = true;
    @tracked bootPromise = null;
    @tracked extensionsLoadedPromise = null;
    @tracked extensionsLoadedResolver = null;
    @tracked extensionsLoaded = false;

    constructor() {
        super(...arguments);
        // Create a promise that resolves when extensions are loaded
        this.extensionsLoadedPromise = new Promise((resolve) => {
            this.extensionsLoadedResolver = resolve;
        });
    }

    /**
     * Ensure an engine is loaded
     * This is the key method that triggers lazy loading
     * 
     * @method ensureEngineLoaded
     * @param {String} engineName Name of the engine to load
     * @returns {Promise<EngineInstance>} The loaded engine instance
     */
    async ensureEngineLoaded(engineName) {
        // Return cached instance if already loaded
        if (this.loadedEngines.has(engineName)) {
            return this.loadedEngines.get(engineName);
        }

        // Return existing loading promise if currently loading
        if (this.loadingPromises.has(engineName)) {
            return this.loadingPromises.get(engineName);
        }

        // Start loading the engine
        const loadingPromise = this._loadEngine(engineName);
        this.loadingPromises.set(engineName, loadingPromise);

        try {
            const engineInstance = await loadingPromise;
            this.loadedEngines.set(engineName, engineInstance);
            this.loadingPromises.delete(engineName);
            return engineInstance;
        } catch (error) {
            this.loadingPromises.delete(engineName);
            throw error;
        }
    }

    /**
     * Internal method to load an engine
     * 
     * @private
     * @method _loadEngine
     * @param {String} engineName Name of the engine
     * @returns {Promise<EngineInstance>} The engine instance
     */
    async _loadEngine(engineName) {
        const owner = getOwner(this);
        
        assert(
            `ExtensionManager requires an owner to load engines`,
            owner
        );

        // This lookup triggers Ember's lazy loading mechanism
        const engineInstance = owner.lookup(`engine:${engineName}`);

        if (!engineInstance) {
            throw new Error(`Engine '${engineName}' not found. Make sure it is mounted in router.js`);
        }

        return engineInstance;
    }

    /**
     * Get an engine instance if it's already loaded
     * Does not trigger loading
     * 
     * @method getEngineInstance
     * @param {String} engineName Name of the engine
     * @returns {EngineInstance|null} The engine instance or null
     */
    getEngineInstance(engineName) {
        return this.loadedEngines.get(engineName) || null;
    }

    /**
     * Check if an engine is loaded
     * 
     * @method isEngineLoaded
     * @param {String} engineName Name of the engine
     * @returns {Boolean} True if engine is loaded
     */
    isEngineLoaded(engineName) {
        return this.loadedEngines.has(engineName);
    }

    /**
     * Check if an engine is currently loading
     * 
     * @method isEngineLoading
     * @param {String} engineName Name of the engine
     * @returns {Boolean} True if engine is loading
     */
    isEngineLoading(engineName) {
        return this.loadingPromises.has(engineName);
    }

    /**
     * Register an extension
     * 
     * @method registerExtension
     * @param {String} name Extension name
     * @param {Object} metadata Extension metadata
     */
    registerExtension(name, metadata = {}) {
        const existing = this.registeredExtensions.find(ext => ext.name === name);
        
        if (existing) {
            Object.assign(existing, metadata);
        } else {
            this.registeredExtensions.pushObject({
                name,
                ...metadata
            });
        }
    }

    /**
     * Get all registered extensions
     * 
     * @method getExtensions
     * @returns {Array} Array of registered extensions
     */
    getExtensions() {
        return this.registeredExtensions;
    }

    /**
     * Get a specific extension
     * 
     * @method getExtension
     * @param {String} name Extension name
     * @returns {Object|null} Extension metadata or null
     */
    getExtension(name) {
        return this.registeredExtensions.find(ext => ext.name === name) || null;
    }

    /**
     * Preload specific engines
     * Useful for critical engines that should load early
     * 
     * @method preloadEngines
     * @param {Array<String>} engineNames Array of engine names to preload
     * @returns {Promise<Array>} Array of loaded engine instances
     */
    async preloadEngines(engineNames) {
        const promises = engineNames.map(name => this.ensureEngineLoaded(name));
        return Promise.all(promises);
    }

    /**
     * Unload an engine
     * Useful for memory management in long-running applications
     * 
     * @method unloadEngine
     * @param {String} engineName Name of the engine to unload
     */
    unloadEngine(engineName) {
        if (this.loadedEngines.has(engineName)) {
            const engineInstance = this.loadedEngines.get(engineName);
            
            // Destroy the engine instance if it has a destroy method
            if (engineInstance && typeof engineInstance.destroy === 'function') {
                engineInstance.destroy();
            }
            
            this.loadedEngines.delete(engineName);
        }
    }

    /**
     * Mark extensions as loaded
     * Called by load-extensions initializer after extensions are loaded from API
     * 
     * @method finishLoadingExtensions
     */
    finishLoadingExtensions() {
        this.extensionsLoaded = true;
        
        // Resolve the extensions loaded promise
        if (this.extensionsLoadedResolver) {
            this.extensionsLoadedResolver();
            this.extensionsLoadedResolver = null;
        }
    }

    /**
     * Wait for extensions to be loaded from API
     * Returns immediately if already loaded
     * 
     * @method waitForExtensionsLoaded
     * @returns {Promise} Promise that resolves when extensions are loaded
     */
    waitForExtensionsLoaded() {
        if (this.extensionsLoaded) {
            return Promise.resolve();
        }
        return this.extensionsLoadedPromise;
    }

    /**
     * Mark the boot process as complete
     * Called by the Universe service after all extensions are initialized
     * 
     * @method finishBoot
     */
    finishBoot() {
        this.isBooting = false;
        
        // Resolve the boot promise if it exists
        if (this.bootPromise) {
            this.bootPromise.resolve();
            this.bootPromise = null;
        }
    }

    /**
     * Wait for the boot process to complete
     * Returns immediately if already booted
     * 
     * @method waitForBoot
     * @returns {Promise} Promise that resolves when boot is complete
     */
    waitForBoot() {
        // If not booting, return resolved promise
        if (!this.isBooting) {
            return Promise.resolve();
        }

        // If boot promise doesn't exist, create it
        if (!this.bootPromise) {
            let resolve, reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            
            this.bootPromise = {
                promise,
                resolve,
                reject
            };
        }

        return this.bootPromise.promise;
    }

    /**
     * Load extensions from API and populate application
     * Encapsulates the extension loading logic
     * 
     * @method loadExtensions
     * @param {Application} application The Ember application instance
     * @returns {Promise<Array>} Array of loaded extension names
     */
    async loadExtensions(application) {
        console.log('[ExtensionManager] Loading extensions from API...');
        
        try {
            const extensions = await loadExtensions();
            application.extensions = extensions;
            application.engines = mapEngines(extensions);
            console.log('[ExtensionManager] Loaded extensions:', extensions);
            
            // Mark extensions as loaded
            this.finishLoadingExtensions();
            
            return extensions;
        } catch (error) {
            console.error('[ExtensionManager] Failed to load extensions:', error);
            // Set empty arrays on error
            application.extensions = [];
            application.engines = {};
            // Still mark as loaded to prevent hanging
            this.finishLoadingExtensions();
            throw error;
        }
    }

    /**
     * Setup extensions by loading and executing their extension.js files
     * 
     * @method setupExtensions
     * @param {ApplicationInstance} appInstance The application instance
     * @param {Service} universe The universe service
     * @returns {Promise<void>}
     */
    async setupExtensions(appInstance, universe) {
        const application = appInstance.application;

        console.log('[ExtensionManager] Waiting for extensions to load...');
        
        // Wait for extensions to be loaded from API
        await this.waitForExtensionsLoaded();
        
        console.log('[ExtensionManager] Extensions loaded, setting up...');

        // Get the list of enabled extensions
        const extensions = application.extensions || [];
        console.log('[ExtensionManager] Setting up extensions:', extensions);

        // Load and execute extension.js from each enabled extension
        for (const extension of extensions) {
            // Extension is an object with name, version, etc. from package.json
            const extensionName = extension.name || extension;
            
            try {
                // Dynamically require the extension.js file
                const setupExtension = require(`${extensionName}/extension`).default;

                if (typeof setupExtension === 'function') {
                    console.log(`[ExtensionManager] Running setup for ${extensionName}`);
                    // Execute the extension setup function
                    setupExtension(appInstance, universe);
                }
            } catch (error) {
                // Silently fail if extension.js doesn't exist
                console.warn(`[ExtensionManager] Could not load extension.js for ${extensionName}:`, error.message);
            }
        }

        console.log('[ExtensionManager] All extensions setup complete');
    }

    /**
     * Get loading statistics
     * 
     * @method getStats
     * @returns {Object} Statistics about loaded engines
     */
    getStats() {
        return {
            isBooting: this.isBooting,
            extensionsLoaded: this.extensionsLoaded,
            loadedCount: this.loadedEngines.size,
            loadingCount: this.loadingPromises.size,
            registeredCount: this.registeredExtensions.length,
            loadedEngines: Array.from(this.loadedEngines.keys()),
            loadingEngines: Array.from(this.loadingPromises.keys())
        };
    }
}

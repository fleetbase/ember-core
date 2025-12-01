import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A } from '@ember/array';
import { getOwner } from '@ember/application';
import { assert, debug } from '@ember/debug';
import loadExtensions from '@fleetbase/ember-core/utils/load-extensions';
import mapEngines from '@fleetbase/ember-core/utils/map-engines';
import { getExtensionLoader } from '@fleetbase/console/extensions';
import { isArray } from '@ember/array';
import RSVP from 'rsvp';

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
        const loadingPromise = this.#loadEngine(engineName);
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
     * @method #loadEngine
     * @param {String} name Name of the engine
     * @returns {Promise<EngineInstance>} The engine instance
     */
    #loadEngine(name) {
        const router = getOwner(this).lookup('router:main');
        const instanceId = 'manual'; // Arbitrary instance id, should be unique per engine
        const mountPoint = this.#mountPathFromEngineName(name);

        if (!router._enginePromises[name]) {
            router._enginePromises[name] = Object.create(null);
        }

        let enginePromise = router._enginePromises[name][instanceId];

        // We already have a Promise for this engine instance
        if (enginePromise) {
            return enginePromise;
        }

        if (router._engineIsLoaded(name)) {
            // The Engine is loaded, but has no Promise
            enginePromise = RSVP.resolve();
        } else {
            // The Engine is not loaded and has no Promise
            enginePromise = router._assetLoader.loadBundle(name).then(
                () => router._registerEngine(name),
                (error) => {
                    router._enginePromises[name][instanceId] = undefined;
                    throw error;
                }
            );
        }

        return (router._enginePromises[name][instanceId] = enginePromise.then(() => {
            return this.constructEngineInstance(name, instanceId, mountPoint);
        }));
    }

    /**
     * Public alias for loading an engine
     * 
     * @method loadEngine
     * @param {String} name Name of the engine
     * @returns {Promise<EngineInstance>} The engine instance
     */
    loadEngine(name) {
        return this.#loadEngine(name);
    }

    /**
     * Get mount path from engine name
     * Handles scoped packages and removes engine suffix
     * 
     * @private
     * @method #mountPathFromEngineName
     * @param {String} engineName Engine name (e.g., '@fleetbase/fleetops-engine')
     * @returns {String} Mount path (e.g., 'console.fleetops')
     */
    #mountPathFromEngineName(engineName) {
        let engineNameSegments = engineName.split('/');
        let mountName = engineNameSegments[1];

        if (typeof mountName !== 'string') {
            mountName = engineNameSegments[0];
        }

        const mountPath = mountName.replace('-engine', '');
        return `console.${mountPath}`;
    }

    /**
     * Get an engine instance if it's already loaded
     * Does not trigger loading
     * 
     * @method getEngineInstance
     * @param {String} engineName Name of the engine
     * @returns {EngineInstance|null} The engine instance or null
     */
    /**
     * Construct an engine instance. If the instance does not exist yet, it
     * will be created.
     * 
     * @method constructEngineInstance
     * @param {String} name The name of the engine
     * @param {String} instanceId The id of the engine instance
     * @param {String} mountPoint The mount point of the engine
     * @returns {Promise<EngineInstance>} A Promise that resolves with the constructed engine instance
     */
    constructEngineInstance(name, instanceId, mountPoint) {
        const owner = getOwner(this);
        const router = owner.lookup('router:main');

        assert(
            `You attempted to load the engine '${name}' with '${instanceId}', but the engine cannot be found.`,
            router.hasRegistration(`engine:${name}`)
        );

        let engineInstances = router._engineInstances;
        if (!engineInstances) {
            engineInstances = router._engineInstances = Object.create(null);
        }
        if (!engineInstances[name]) {
            engineInstances[name] = Object.create(null);
        }

        let engineInstance = engineInstances[name][instanceId];

        if (!engineInstance) {
            engineInstance = owner.buildChildEngineInstance(name, {
                routable: true,
                mountPoint: mountPoint
            });

            // correct mountPoint using engine instance
            const _mountPoint = this.#getMountPointFromEngineInstance(engineInstance);
            if (_mountPoint) {
                engineInstance.mountPoint = _mountPoint;
            }

            // make sure to set dependencies from base instance
            if (engineInstance.base) {
                engineInstance.dependencies = this.#setupEngineParentDependenciesBeforeBoot(engineInstance.base.dependencies);
            }

            // store loaded instance to engineInstances for booting
            engineInstances[name][instanceId] = engineInstance;

            this.trigger('engine.loaded', engineInstance);

            return engineInstance.boot().then(() => {
                return engineInstance;
            });
        }

        return RSVP.resolve(engineInstance);
    }

    /**
     * Helper to get the mount point from the engine instance.
     * @private
     * @param {EngineInstance} engineInstance 
     * @returns {String|null}
     */
    #getMountPointFromEngineInstance(engineInstance) {
        const owner = getOwner(this);
        const router = owner.lookup('router:main');
        const engineName = engineInstance.base.name;
        
        // This logic is complex and depends on how the router stores mount points.
        // For now, we'll return the engine name as a fallback, assuming the router
        // handles the actual mount point lookup during engine registration.
        // The original code snippet suggests a custom method: this._mountPointFromEngineInstance(engineInstance)
        // Since we don't have that, we'll rely on the engine's name or the default mountPoint.
        return engineInstance.mountPoint || engineName;
    }

    /**
     * Setup engine parent dependencies before boot.
     * Fixes service and external route dependencies.
     * 
     * @private
     * @param {Object} baseDependencies 
     * @returns {Object} Fixed dependencies
     */
    #setupEngineParentDependenciesBeforeBoot(baseDependencies = {}) {
        const dependencies = { ...baseDependencies };

        // fix services
        const servicesObject = {};
        if (isArray(dependencies.services)) {
            for (let i = 0; i < dependencies.services.length; i++) {
                const service = dependencies.services.objectAt(i);
                if (typeof service === 'object') {
                    Object.assign(servicesObject, service);
                    continue;
                }
                servicesObject[service] = service;
            }
        }
        dependencies.services = servicesObject;

        // fix external routes
        const externalRoutesObject = {};
        if (isArray(dependencies.externalRoutes)) {
            for (let i = 0; i < dependencies.externalRoutes.length; i++) {
                const externalRoute = dependencies.externalRoutes.objectAt(i);
                if (typeof externalRoute === 'object') {
                    Object.assign(externalRoutesObject, externalRoute);
                    continue;
                }
                externalRoutesObject[externalRoute] = externalRoute;
            }
        }
        dependencies.externalRoutes = externalRoutesObject;

        return dependencies;
    }

    /**
     * Get an engine instance if it's already loaded
     * Does not trigger loading
     * 
     * @method getEngineInstance
     * @param {String} engineName Name of the engine
     * @param {String} instanceId Optional instance ID (defaults to 'manual')
     * @returns {EngineInstance|null} The engine instance or null
     */
    getEngineInstance(engineName, instanceId = 'manual') {
        const owner = getOwner(this);
        const router = owner.lookup('router:main');
        const engineInstances = router._engineInstances;

        if (engineInstances && engineInstances[engineName] && engineInstances[engineName][instanceId]) {
            return engineInstances[engineName][instanceId];
        }

        return null;
    }

    /**
     * Check if an engine is loaded
     * 
     * @method isEngineLoaded
     * @param {String} engineName Name of the engine
     * @returns {Boolean} True if engine is loaded
     */
    isEngineLoaded(engineName) {
        const owner = getOwner(this);
        const router = owner.lookup('router:main');
        return router.engineIsLoaded(engineName);
    }

    /**
     * Check if an engine is currently loading
     * 
     * @method isEngineLoading
     * @param {String} engineName Name of the engine
     * @returns {Boolean} True if engine is loading
     */
    isEngineLoading(engineName) {
        const owner = getOwner(this);
        const router = owner.lookup('router:main');
        return !!(router._enginePromises && router._enginePromises[engineName]);
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
        const startTime = performance.now();
        debug('[ExtensionManager] Loading extensions from API...');
        
        try {
            const apiStartTime = performance.now();
            const extensions = await loadExtensions();
            const apiEndTime = performance.now();
            debug(`[ExtensionManager] API call took ${(apiEndTime - apiStartTime).toFixed(2)}ms`);
            
            application.extensions = extensions;
            application.engines = mapEngines(extensions);
            
            const endTime = performance.now();
            debug(`[ExtensionManager] Loaded ${extensions.length} extensions in ${(endTime - startTime).toFixed(2)}ms:`, extensions.map(e => e.name || e));
            
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
        const setupStartTime = performance.now();
        const application = appInstance.application;

        debug('[ExtensionManager] Waiting for extensions to load...');
        
        const waitStartTime = performance.now();
        // Wait for extensions to be loaded from API
        await this.waitForExtensionsLoaded();
        const waitEndTime = performance.now();
        debug(`[ExtensionManager] Wait for extensions took ${(waitEndTime - waitStartTime).toFixed(2)}ms`);
        
        debug('[ExtensionManager] Extensions loaded, setting up...');

        // Get the list of enabled extensions
        const extensions = application.extensions || [];
        debug(`[ExtensionManager] Setting up ${extensions.length} extensions:`, extensions.map(e => e.name || e));

        const extensionTimings = [];

        // Load and execute extension.js from each enabled extension
        for (const extension of extensions) {
            // Extension is an object with name, version, etc. from package.json
            const extensionName = extension.name || extension;
            const extStartTime = performance.now();
            
            // Lookup the loader function from the build-time generated map
            const loader = getExtensionLoader(extensionName);
            
            if (!loader) {
                console.warn(
                    `[ExtensionManager] No loader registered for ${extensionName}. ` +
                    'Ensure addon/extension.js exists and prebuild generated the mapping.'
                );
                continue;
            }
            
            try {
                const loadStartTime = performance.now();
                // Use dynamic import() via the loader function
                const module = await loader();
                const loadEndTime = performance.now();
                
                const setupExtension = module.default ?? module;
                
                if (typeof setupExtension === 'function') {
                    debug(`[ExtensionManager] Running setup for ${extensionName}`);
                    const execStartTime = performance.now();
                    // Execute the extension setup function
                    await setupExtension(appInstance, universe);
                    const execEndTime = performance.now();
                    
                    const extEndTime = performance.now();
                    const timing = {
                        name: extensionName,
                        load: (loadEndTime - loadStartTime).toFixed(2),
                        execute: (execEndTime - execStartTime).toFixed(2),
                        total: (extEndTime - extStartTime).toFixed(2)
                    };
                    extensionTimings.push(timing);
                    debug(`[ExtensionManager] ${extensionName} - Load: ${timing.load}ms, Execute: ${timing.execute}ms, Total: ${timing.total}ms`);
                } else {
                    console.warn(
                        `[ExtensionManager] ${extensionName}/extension did not export a function.`
                    );
                }
            } catch (error) {
                console.error(
                    `[ExtensionManager] Failed to load or run extension.js for ${extensionName}:`,
                    error
                );
            }
        }

        const setupEndTime = performance.now();
        const totalSetupTime = (setupEndTime - setupStartTime).toFixed(2);
        debug(`[ExtensionManager] All extensions setup complete in ${totalSetupTime}ms`);
        debug('[ExtensionManager] Extension timings:', extensionTimings);
        
        // Execute boot callbacks and mark boot as complete
        const callbackStartTime = performance.now();
        await universe.executeBootCallbacks();
        const callbackEndTime = performance.now();
        debug(`[ExtensionManager] Boot callbacks executed in ${(callbackEndTime - callbackStartTime).toFixed(2)}ms`);
        
        const totalTime = (callbackEndTime - setupStartTime).toFixed(2);
        debug(`[ExtensionManager] Total extension boot time: ${totalTime}ms`);
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

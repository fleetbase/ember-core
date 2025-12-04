import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
import { A } from '@ember/array';
import { getOwner } from '@ember/application';
import { assert, debug } from '@ember/debug';
import { next } from '@ember/runloop';
import loadExtensions from '@fleetbase/ember-core/utils/load-extensions';
import loadInstalledExtensions from '@fleetbase/ember-core/utils/load-installed-extensions';
import mapEngines from '@fleetbase/ember-core/utils/map-engines';
import config from 'ember-get-config';
import { getExtensionLoader } from '@fleetbase/console/extensions';
import { isArray } from '@ember/array';
import RSVP from 'rsvp';
import ExtensionBootState from '../../contracts/extension-boot-state';

/**
 * ExtensionManagerService
 *
 * Manages lazy loading of engines and extension lifecycle.
 * Replaces the old bootEngines mechanism with on-demand loading.
 *
 * @class ExtensionManagerService
 * @extends Service
 */
export default class ExtensionManagerService extends Service.extend(Evented) {
    @tracked applicationInstance = null;

    constructor() {
        super(...arguments);
        // Initialize shared boot state
        this.bootState = this.#initializeBootState();
        // Patch owner to track engine loading via router
        this.#patchOwnerForEngineTracking();
    }

    /**
     * Set the application instance
     * 
     * @method setApplicationInstance
     * @param {Application} application The root application instance
     */
    setApplicationInstance(application) {
        this.applicationInstance = application;
    }

    /**
     * Initialize shared boot state singleton
     * Ensures all ExtensionManager instances share the same boot state
     * 
     * @private
     * @returns {ExtensionBootState}
     */
    #initializeBootState() {
        const stateKey = 'state:extension-boot';
        const application = this.#getApplication();
        
        if (!application.hasRegistration(stateKey)) {
            const bootState = new ExtensionBootState();
            // Create the extensionsLoadedPromise
            bootState.extensionsLoadedPromise = new Promise((resolve) => {
                bootState.extensionsLoadedResolver = resolve;
            });
            application.register(stateKey, bootState, { 
                instantiate: false 
            });
        }
        
        return application.resolveRegistration(stateKey);
    }

    /**
     * Get the application instance
     * Tries multiple fallback methods to find the root application
     * 
     * @private
     * @returns {Application}
     */
    #getApplication() {
        // First priority: use applicationInstance if set
        if (this.applicationInstance) {
            return this.applicationInstance;
        }

        // Second priority: window.Fleetbase
        if (typeof window !== 'undefined' && window.Fleetbase) {
            return window.Fleetbase;
        }
        
        // Third priority: try to get application from owner
        const owner = getOwner(this);
        if (owner && owner.application) {
            return owner.application;
        }
        
        // Last resort: return owner itself (might be EngineInstance)
        return owner;
    }

    /**
     * Getters and setters for boot state properties
     * These delegate to the shared bootState object
     */
    get isBooting() {
        return this.bootState.isBooting;
    }

    set isBooting(value) {
        this.bootState.isBooting = value;
    }

    get bootPromise() {
        return this.bootState.bootPromise;
    }

    set bootPromise(value) {
        this.bootState.bootPromise = value;
    }

    get extensionsLoadedPromise() {
        return this.bootState.extensionsLoadedPromise;
    }

    set extensionsLoadedPromise(value) {
        this.bootState.extensionsLoadedPromise = value;
    }

    get extensionsLoadedResolver() {
        return this.bootState.extensionsLoadedResolver;
    }

    set extensionsLoadedResolver(value) {
        this.bootState.extensionsLoadedResolver = value;
    }

    get extensionsLoaded() {
        return this.bootState.extensionsLoaded;
    }

    set extensionsLoaded(value) {
        this.bootState.extensionsLoaded = value;
    }

    get loadedEngines() {
        return this.bootState.loadedEngines;
    }

    set loadedEngines(value) {
        this.bootState.loadedEngines = value;
    }

    get registeredExtensions() {
        return this.bootState.registeredExtensions;
    }

    set registeredExtensions(value) {
        this.bootState.registeredExtensions = value;
    }

    get loadingPromises() {
        return this.bootState.loadingPromises;
    }

    set loadingPromises(value) {
        this.bootState.loadingPromises = value;
    }

    /**
     * Getter for engineLoadedHooks (not tracked, just a Map)
     * Delegates to the shared bootState object
     */
    get #engineLoadedHooks() {
        return this.bootState.engineLoadedHooks;
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
        const application = this.#getApplication();
        const router = application.lookup('router:main');
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
        const application = this.#getApplication();
        const router = application.lookup('router:main');

        assert(`You attempted to load the engine '${name}' with '${instanceId}', but the engine cannot be found.`, application.hasRegistration(`engine:${name}`));

        let engineInstances = router._engineInstances;
        if (!engineInstances) {
            engineInstances = router._engineInstances = Object.create(null);
        }
        if (!engineInstances[name]) {
            engineInstances[name] = Object.create(null);
        }

        let engineInstance = engineInstances[name][instanceId];

        if (!engineInstance) {
            engineInstance = application.buildChildEngineInstance(name, {
                routable: true,
                mountPoint: mountPoint,
            });

            // store loaded instance to engineInstances for booting
            engineInstances[name][instanceId] = engineInstance;

            return engineInstance.boot().then(() => {
                // Only trigger if not already triggered (prevent double execution)
                if (!engineInstance._hooksTriggered) {
                    // Fire event for universe.onEngineLoaded() API
                    this.trigger('engine.loaded', name, engineInstance);
                    // Run stored onEngineLoaded hooks from extension.js
                    this.#runEngineLoadedHooks(name, engineInstance);
                    // Clear hooks after running to prevent double execution
                    this.#engineLoadedHooks.delete(name);
                    // Mark as triggered
                    engineInstance._hooksTriggered = true;
                }

                return engineInstance;
            });
        }

        return RSVP.resolve(engineInstance);
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

        // Get service from app instance
        const applicationInstance = this.#getApplication();

        // fix services
        const servicesObject = {};
        if (isArray(dependencies.services)) {
            for (let i = 0; i < dependencies.services.length; i++) {
                let serviceName = dependencies.services.objectAt(i);
                if (typeof serviceName === 'object') {
                    Object.assign(servicesObject, serviceName);
                    continue;
                }

                if (serviceName === 'hostRouter') {
                    const service = applicationInstance.lookup('service:router') ?? serviceName;
                    servicesObject[serviceName] = service;
                    continue;
                }

                const service = applicationInstance.lookup(`service:${serviceName}`) ?? serviceName;
                servicesObject[serviceName] = service;
            }
        }

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
        dependencies.services = servicesObject;
        return dependencies;
    }

    /**
     * Retrieves the mount point of a specified engine by its name.
     *
     * @method getEngineMountPoint
     * @param {String} engineName - The name of the engine for which to get the mount point.
     * @returns {String|null} The mount point of the engine or null if not found.
     */
    getEngineMountPoint(engineName) {
        const engineInstance = this.getEngineInstance(engineName);
        return this.#getMountPointFromEngineInstance(engineInstance);
    }

    /**
     * Determines the mount point from an engine instance by reading its configuration.
     *
     * @private
     * @method #getMountPointFromEngineInstance
     * @param {Object} engineInstance - The instance of the engine.
     * @returns {String|null} The resolved mount point or null if the instance is undefined or the configuration is not set.
     */
    #getMountPointFromEngineInstance(engineInstance) {
        if (engineInstance) {
            const config = engineInstance.resolveRegistration('config:environment');

            if (config) {
                let engineName = config.modulePrefix;
                let mountedEngineRoutePrefix = config.mountedEngineRoutePrefix;

                if (!mountedEngineRoutePrefix) {
                    mountedEngineRoutePrefix = this.#mountPathFromEngineName(engineName);
                }

                if (!mountedEngineRoutePrefix.endsWith('.')) {
                    mountedEngineRoutePrefix = mountedEngineRoutePrefix + '.';
                }

                return mountedEngineRoutePrefix;
            }
        }

        return null;
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
        // Use loadedEngines Map which tracks all loaded engines regardless of how they were loaded
        if (this.loadedEngines.has(engineName)) {
            return this.loadedEngines.get(engineName);
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
        const application = this.#getApplication();
        const router = application.lookup('router:main');
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
        const application = this.#getApplication();
        const router = application.lookup('router:main');
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
        const existing = this.registeredExtensions.find((ext) => ext.name === name);

        if (existing) {
            Object.assign(existing, metadata);
        } else {
            this.registeredExtensions.pushObject({
                name,
                ...metadata,
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
        return this.registeredExtensions.find((ext) => ext.name === name) || null;
    }

    /**
     * Check if an extension is registered/installed
     *
     * @method isExtensionInstalled
     * @param {String} name Extension name
     * @returns {Boolean} True if extension is registered
     */
    isExtensionInstalled(name) {
        return this.registeredExtensions.some((ext) => ext.name === name);
    }

    /**
     * Alias for isExtensionInstalled
     * @method isEngineInstalled
     */
    isEngineInstalled(name) {
        return this.isExtensionInstalled(name);
    }

    /**
     * Alias for isExtensionInstalled
     * @method hasExtensionIndexed
     */
    hasExtensionIndexed(name) {
        return this.isExtensionInstalled(name);
    }

    /**
     * Alias for isExtensionInstalled
     * @method isInstalled
     */
    isInstalled(name) {
        return this.isExtensionInstalled(name);
    }

    /**
     * Check if an engine has been loaded (boot started or completed)
     *
     * @method isEngineLoaded
     * @param {String} name Engine name
     * @returns {Boolean} True if engine is loaded
     */
    isEngineLoaded(name) {
        return this.loadedEngines.has(name);
    }

    /**
     * Check if an engine is currently loading
     *
     * @method isEngineLoading
     * @param {String} name Engine name
     * @returns {Boolean} True if engine is currently loading
     */
    isEngineLoading(name) {
        return this.loadingPromises.has(name);
    }

    /**
     * Check if an extension has been set up (extension.js executed)
     * This checks if the extension has been registered, which happens during setup
     *
     * @method isExtensionSetup
     * @param {String} name Extension name
     * @returns {Boolean} True if extension setup has run
     */
    isExtensionSetup(name) {
        return this.isExtensionInstalled(name);
    }

    /**
     * Alias for isExtensionSetup
     * @method hasExtensionSetup
     */
    hasExtensionSetup(name) {
        return this.isExtensionSetup(name);
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
        const promises = engineNames.map((name) => this.ensureEngineLoaded(name));
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
     * Execute a callback when an engine is loaded
     * If the engine is already loaded, the callback runs immediately
     * Otherwise, it's stored and runs when the engine loads
     *
     * @method whenEngineLoaded
     * @param {String} engineName The name of the engine
     * @param {Function} callback The callback to execute, receives (engineInstance, universe, appInstance)
     * @example
     * // Simple usage
     * extensionManager.whenEngineLoaded('@fleetbase/fleetops-engine', (fleetopsEngine) => {
     *     console.log('FleetOps loaded!', fleetopsEngine);
     * });
     *
     * @example
     * // With all parameters
     * extensionManager.whenEngineLoaded('@fleetbase/customer-portal-engine', (portalEngine, universe, app) => {
     *     setupIntegration(portalEngine, universe);
     * });
     */
    whenEngineLoaded(engineName, callback) {
        this.#storeEngineLoadedHook(engineName, callback);
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
                reject,
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
        try {
            // Get admin-configured extensions from config
            const additionalCoreExtensions = config.APP?.extensions ?? [];

            // Load installed extensions (includes core, admin-configured, and user-installed)
            const extensions = await loadInstalledExtensions(additionalCoreExtensions);

            application.extensions = extensions;
            application.engines = mapEngines(extensions);

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

        // Wait for extensions to be loaded from API
        await this.waitForExtensionsLoaded();

        // Get the list of enabled extensions
        const extensions = application.extensions || [];

        // Phase 1: Register all extensions first so isInstalled() works during setup
        for (const extension of extensions) {
            const extensionName = extension.name || extension;
            this.registerExtension(extensionName, extension);
        }

        // Phase 2: Load and execute extension.js from each enabled extension
        for (const extension of extensions) {
            // Extension is an object with name, version, etc. from package.json
            const extensionName = extension.name || extension;
            const extStartTime = performance.now();

            // Lookup the loader function from the build-time generated map
            const loader = getExtensionLoader(extensionName);

            if (!loader) {
                console.warn(`[ExtensionManager] No loader registered for ${extensionName}. ` + 'Ensure addon/extension.js exists and prebuild generated the mapping.');
                continue;
            }

            try {
                
                const loadStartTime = performance.now();
                // Use dynamic import() via the loader function
                const module = await loader();
                const loadEndTime = performance.now();

                const setup = module.default ?? module;
                const execStartTime = performance.now();
                let executed = false;

                // Handle function export
                if (typeof setup === 'function') {
                    await setup(appInstance, universe);
                    executed = true;
                }
                // Handle object export
                else if (typeof setup === 'object' && setup !== null) {
                    // Run setupExtension hook (before engine loads)
                    if (typeof setup.setupExtension === 'function') {
                        await setup.setupExtension(appInstance, universe);
                        executed = true;
                    }

                    // Store onEngineLoaded hook (runs after engine loads)
                    if (typeof setup.onEngineLoaded === 'function') {
                        this.#storeEngineLoadedHook(extensionName, setup.onEngineLoaded);
                        executed = true;
                    }
                }

                if (!executed) {
                    console.warn(`[ExtensionManager] ${extensionName}/extension did not export a function or valid object with setupExtension/onEngineLoaded.`);
                }
            } catch (error) {
                console.error(`[ExtensionManager] Failed to load or run extension.js for ${extensionName}:`, error);
            }
        }

        // Execute boot callbacks and mark boot as complete
        await universe.executeBootCallbacks();
    }

    /**
     * Register a service into a specific engine
     * Allows sharing host services with engines
     *
     * @method registerServiceIntoEngine
     * @param {String} engineName Name of the engine
     * @param {String} serviceName Name of the service to register
     * @param {Class} serviceClass Service class to register
     * @param {Object} options Registration options
     * @returns {Boolean} True if successful, false if engine not found
     */
    registerServiceIntoEngine(engineName, serviceName, serviceClass, options = {}) {
        const engineInstance = this.getEngineInstance(engineName);

        if (!engineInstance) {
            console.warn(`[ExtensionManager] Cannot register service '${serviceName}' - engine '${engineName}' not loaded`);
            return false;
        }

        try {
            engineInstance.register(`service:${serviceName}`, serviceClass, options);
            return true;
        } catch (error) {
            console.error(`[ExtensionManager] Failed to register service '${serviceName}' into engine '${engineName}':`, error);
            return false;
        }
    }

    /**
     * Register a component into a specific engine
     * Allows sharing host components with engines
     *
     * @method registerComponentIntoEngine
     * @param {String} engineName Name of the engine
     * @param {String} componentName Name of the component to register
     * @param {Class} componentClass Component class to register
     * @param {Object} options Registration options
     * @returns {Boolean} True if successful, false if engine not found
     */
    registerComponentIntoEngine(engineName, componentName, componentClass, options = {}) {
        const engineInstance = this.getEngineInstance(engineName);

        if (!engineInstance) {
            console.warn(`[ExtensionManager] Cannot register component '${componentName}' - engine '${engineName}' not loaded`);
            return false;
        }

        try {
            engineInstance.register(`component:${componentName}`, componentClass, options);
            return true;
        } catch (error) {
            console.error(`[ExtensionManager] Failed to register component '${componentName}' into engine '${engineName}':`, error);
            return false;
        }
    }

    /**
     * Register a service into all loaded engines
     * Useful for sharing a host service with all engines
     *
     * @method registerServiceIntoAllEngines
     * @param {String} serviceName Name of the service to register
     * @param {Class} serviceClass Service class to register
     * @param {Object} options Registration options
     * @returns {Array<String>} Array of engine names where registration succeeded
     */
    registerServiceIntoAllEngines(serviceName, serviceClass, options = {}) {
        const succeededEngines = [];

        for (const [engineName] of this.loadedEngines) {
            const success = this.registerServiceIntoEngine(engineName, serviceName, serviceClass, options);
            if (success) {
                succeededEngines.push(engineName);
            }
        }

        return succeededEngines;
    }

    /**
     * Register a component into all loaded engines
     * Useful for sharing a host component with all engines
     *
     * @method registerComponentIntoAllEngines
     * @param {String} componentName Name of the component to register
     * @param {Class} componentClass Component class to register
     * @param {Object} options Registration options
     * @returns {Array<String>} Array of engine names where registration succeeded
     */
    registerComponentIntoAllEngines(componentName, componentClass, options = {}) {
        const succeededEngines = [];

        for (const [engineName] of this.loadedEngines) {
            const success = this.registerComponentIntoEngine(engineName, componentName, componentClass, options);
            if (success) {
                succeededEngines.push(engineName);
            }
        }

        return succeededEngines;
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
            loadingEngines: Array.from(this.loadingPromises.keys()),
        };
    }

    /**
     * Store an onEngineLoaded hook for later execution
     *
     * @private
     * @method #storeEngineLoadedHook
     * @param {String} engineName The name of the engine
     * @param {Function} hookFn The hook function to store
     */
    #storeEngineLoadedHook(engineName, hookFn) {
        // Check if engine is already loaded
        const engineInstance = this.getEngineInstance(engineName);

        if (engineInstance) {
            // Engine already loaded, run hook immediately
            const appInstance = this.#getApplication();
            const universe = appInstance.lookup('service:universe');

            try {
                hookFn(engineInstance, universe, appInstance);
            } catch (error) {
                console.error(`[ExtensionManager] Error in immediate onEngineLoaded hook for ${engineName}:`, error);
            }
        } else {
            // Engine not loaded yet, store hook for later
            if (!this.#engineLoadedHooks.has(engineName)) {
                this.#engineLoadedHooks.set(engineName, []);
            }
            this.#engineLoadedHooks.get(engineName).push(hookFn);
        }
    }

    /**
     * Patch owner's buildChildEngineInstance to track engine loading via router
     * This ensures hooks run even when engines are loaded through routing (LinkTo)
     *
     * @private
     * @method #patchOwnerForEngineTracking
     */
    #patchOwnerForEngineTracking() {
        const owner = this.#getApplication();
        
        // Check if already patched to avoid multiple wrapping
        if (owner._buildChildEngineInstancePatched) {
            return;
        }
        
        const originalBuildChildEngineInstance = owner.buildChildEngineInstance;
        const self = this;

        owner.buildChildEngineInstance = function (name, options) {
            const engineInstance = originalBuildChildEngineInstance.call(this, name, options);

            // correct mountPoint using engine instance
            const _mountPoint = self.#getMountPointFromEngineInstance(engineInstance);
            if (_mountPoint) {
                // Remove trailing dot before setting on engine instance
                engineInstance.mountPoint = _mountPoint.endsWith('.') ? _mountPoint.slice(0, -1) : _mountPoint;
            }

            // make sure to set dependencies from base instance
            if (engineInstance.base) {
                engineInstance.dependencies = self.#setupEngineParentDependenciesBeforeBoot(engineInstance.base.dependencies);
            }

            // Notify ExtensionManager that an engine instance was built
            self.#onEngineInstanceBuilt(name, engineInstance);

            // Patch the engine instance's boot method to trigger events/hooks after boot
            if (!engineInstance._bootPatched) {
                const originalBoot = engineInstance.boot.bind(engineInstance);
                engineInstance.boot = function() {
                    return originalBoot().then(() => {
                        // Add to loadedEngines Map for tracking
                        if (!self.loadedEngines.has(name)) {
                            self.loadedEngines.set(name, engineInstance);
                        }
                        
                        // Only trigger if not already triggered (prevent double execution)
                        if (!engineInstance._hooksTriggered) {
                            // Fire event for universe.onEngineLoaded() API
                            self.trigger('engine.loaded', name, engineInstance);
                            
                            // Run stored onEngineLoaded hooks from extension.js
                            self.#runEngineLoadedHooks(name, engineInstance);
                            
                            // Clear hooks after running to prevent double execution
                            self.#engineLoadedHooks.delete(name);
                            
                            // Mark as triggered
                            engineInstance._hooksTriggered = true;
                        }
                        
                        return engineInstance;
                    });
                };
                engineInstance._bootPatched = true;
            }

            return engineInstance;
        };

        // Mark as patched
        owner._buildChildEngineInstancePatched = true;
    }

    /**
     * Called when an engine instance is built (via router or manual loading)
     * Schedules hooks to run after the engine boots
     *
     * @private
     * @method #onEngineInstanceBuilt
     * @param {String} engineName The name of the engine
     * @param {EngineInstance} engineInstance The built engine instance
     */
    #onEngineInstanceBuilt(engineName, engineInstance) {
        const hooks = this.#engineLoadedHooks.get(engineName);

        if (hooks && hooks.length > 0) {
            // Schedule hooks to run after engine boots
            // Use next() to ensure engine is fully initialized
            next(() => {
                // Check if hooks still exist (they might have been run by constructEngineInstance)
                const currentHooks = this.#engineLoadedHooks.get(engineName);
                if (currentHooks && currentHooks.length > 0) {
                    this.#runEngineLoadedHooks(engineName, engineInstance);
                    this.#engineLoadedHooks.delete(engineName);
                }
            });
        }
    }

    /**
     * Run all stored onEngineLoaded hooks for an engine
     *
     * @private
     * @method #runEngineLoadedHooks
     * @param {String} engineName The name of the engine
     * @param {EngineInstance} engineInstance The loaded engine instance
     */
    #runEngineLoadedHooks(engineName, engineInstance) {
        const hooks = this.#engineLoadedHooks.get(engineName) || [];

        if (hooks.length === 0) {
            return;
        }

        const appInstance = this.#getApplication();
        const universe = appInstance.lookup('service:universe');

        hooks.forEach((hook) => {
            try {
                hook(engineInstance, universe, appInstance);
            } catch (error) {
                console.error(`[ExtensionManager] Error in onEngineLoaded hook for ${engineName}:`, error);
            }
        });
    }
}

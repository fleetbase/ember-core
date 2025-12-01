import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { getOwner } from '@ember/application';
import { A } from '@ember/array';
import MenuItem from '../contracts/menu-item';

/**
 * UniverseService (Refactored)
 * 
 * This is the new UniverseService that acts as a facade to the specialized sub-services.
 * It maintains backward compatibility with the old API while delegating to the new architecture.
 * 
 * The service decomposition provides:
 * - ExtensionManager: Handles lazy loading of engines
 * - RegistryService: Manages all registries using Ember's container
 * - MenuService: Manages menu items and panels
 * - WidgetService: Manages dashboard widgets
 * - HookService: Manages application hooks
 * 
 * @class UniverseService
 * @extends Service
 */
export default class UniverseService extends Service.extend(Evented) {
    // Inject specialized services
    @service('universe/extension-manager') extensionManager;
    @service('universe/registry-service') registryService;
    @service('universe/menu-service') menuService;
    @service('universe/widget-service') widgetService;
    @service('universe/hook-service') hookService;
    @service router;
    @service intl;
    @service urlSearchParams;

    @tracked applicationInstance;
    @tracked initialLocation = { ...window.location };
    @tracked bootCallbacks = A([]);

    /**
     * Initialize the service
     */
    constructor() {
        super(...arguments);
        // The applicationInstance is now injected by the initializer 'inject-application-instance'
        // and passed to the registryService. We keep this for backward compatibility/local lookup.
        this.applicationInstance = getOwner(this);
    }

    /**
     * Get a service by name
     * Convenience method for extensions to access specialized services
     * 
     * @method getService
     * @param {String} serviceName Service name (e.g., 'universe/menu-service')
     * @returns {Service} The service instance
     */
    getService(serviceName) {
        const owner = getOwner(this);
        return owner.lookup(`service:${serviceName}`);
    }

    // ============================================================================
    // Extension Management (delegates to ExtensionManager)
    // ============================================================================

    /**
     * Ensure an engine is loaded
     * 
     * @method ensureEngineLoaded
     * @param {String} engineName Engine name
     * @returns {Promise<EngineInstance>} Engine instance
     */
    async ensureEngineLoaded(engineName) {
        return this.extensionManager.ensureEngineLoaded(engineName);
    }

    /**
     * Get an engine instance
     * 
     * @method getEngineInstance
     * @param {String} engineName Engine name
     * @returns {EngineInstance|null} Engine instance or null
     */
    getEngineInstance(engineName) {
        return this.extensionManager.getEngineInstance(engineName);
    }

    /**
     * Register an extension
     * 
     * @method registerExtension
     * @param {String} name Extension name
     * @param {Object} metadata Extension metadata
     */
    registerExtension(name, metadata = {}) {
        this.extensionManager.registerExtension(name, metadata);
    }

    /**
     * Listen for a specific engine to be loaded
     * 
     * @method onEngineLoaded
     * @param {String} engineName The engine name to listen for
     * @param {Function} callback Function to call when the engine loads, receives engineInstance as parameter
     * @example
     * universe.onEngineLoaded('@fleetbase/fleetops-engine', (engineInstance) => {
     *     console.log('FleetOps engine loaded!', engineInstance);
     * });
     */
    onEngineLoaded(engineName, callback) {
        this.extensionManager.on('engine.loaded', (name, instance) => {
            if (name === engineName) {
                callback(instance);
            }
        });
    }

    /**
     * Get the application instance
     * 
     * @method getApplicationInstance
     * @returns {ApplicationInstance} The application instance
     */
    getApplicationInstance() {
        return this.applicationInstance;
    }

    /**
     * Get a service from a specific engine
     * 
     * @method getServiceFromEngine
     * @param {String} engineName The engine name
     * @param {String} serviceName The service name
     * @param {Object} options Optional options
     * @param {Object} options.inject Properties to inject into the service
     * @returns {Service|null} The service instance or null
     * @example
     * const userService = universe.getServiceFromEngine('user-engine', 'user');
     * if (userService) {
     *     userService.doSomething();
     * }
     */
    getServiceFromEngine(engineName, serviceName, options = {}) {
        const engineInstance = this.getEngineInstance(engineName);

        if (engineInstance && typeof serviceName === 'string') {
            const serviceInstance = engineInstance.lookup(`service:${serviceName}`);
            if (options && options.inject) {
                for (let injectionName in options.inject) {
                    serviceInstance[injectionName] = options.inject[injectionName];
                }
            }
            return serviceInstance;
        }

        return null;
    }

    // ============================================================================
    // Registry Management (delegates to RegistryService)
    // ============================================================================

    /**
     * Create a new registry
     * 
     * @method createRegistry
     * @param {String} name Registry name
     * @returns {Array} The created registry
     */
    createRegistry(name) {
        return this.registryService.createRegistry(name);
    }

    /**
     * Create multiple registries
     * 
     * @method createRegistries
     * @param {Array} names Array of registry names
     */
    createRegistries(names) {
        this.registryService.createRegistries(names);
    }

    /**
     * Get a registry
     * 
     * @method getRegistry
     * @param {String} name Registry name
     * @returns {Array} Registry items
     */
    getRegistry(name) {
        return this.registryService.getRegistry(name);
    }

    /**
     * Register an item to a registry
     * 
     * @method registerInRegistry
     * @param {String} registryName Registry name
     * @param {String} key Item key
     * @param {*} value Item value
     */
    registerInRegistry(registryName, key, value) {
        this.registryService.register(registryName, key, value);
    }

    /**
     * Lookup an item from a registry
     * 
     * @method lookupFromRegistry
     * @param {String} registryName Registry name
     * @param {String} key Item key
     * @returns {*} The registered item
     */
    lookupFromRegistry(registryName, key) {
        return this.registryService.lookup(registryName, key);
    }

    // ============================================================================
    // Application Container Registration (delegates to RegistryService)
    // ============================================================================

    /**
     * Registers a component to the root application container.
     * This ensures the component is available to all engines and the host app.
     * @method registerComponent
     * @param {String} name The component name (e.g., 'my-component')
     * @param {Class} componentClass The component class
     * @param {Object} options Registration options
     */
    registerComponent(name, componentClass, options = {}) {
        this.registryService.registerComponent(name, componentClass, options);
    }

    /**
     * Registers a service to the root application container.
     * This ensures the service is available to all engines and the host app.
     * @method registerService
     * @param {String} name The service name (e.g., 'my-service')
     * @param {Class} serviceClass The service class
     * @param {Object} options Registration options
     */
    registerService(name, serviceClass, options = {}) {
        this.registryService.registerService(name, serviceClass, options);
    }



    // ============================================================================
    // Menu Management (delegates to MenuService)
    // ============================================================================

    /**
     * Register a header menu item
     * 
     * @method registerHeaderMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {String} route Optional route
     * @param {Object} options Optional options
     */
    registerHeaderMenuItem(menuItemOrTitle, route = null, options = {}) {
        this.menuService.registerHeaderMenuItem(menuItemOrTitle, route, options);
    }

    /**
     * Register an organization menu item
     * 
     * @method registerOrganizationMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
    registerOrganizationMenuItem(menuItemOrTitle, options = {}) {
        this.menuService.registerOrganizationMenuItem(menuItemOrTitle, options);
    }

    /**
     * Register a user menu item
     * 
     * @method registerUserMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
    registerUserMenuItem(menuItemOrTitle, options = {}) {
        this.menuService.registerUserMenuItem(menuItemOrTitle, options);
    }

    /**
     * Register an admin menu panel
     * 
     * @method registerAdminMenuPanel
     * @param {MenuPanel|String} panelOrTitle MenuPanel instance or title
     * @param {Array} items Optional items
     * @param {Object} options Optional options
     */
    registerAdminMenuPanel(panelOrTitle, items = [], options = {}) {
        this.menuService.registerAdminMenuPanel(panelOrTitle, items, options);
    }

    /**
     * Register a settings menu item
     * 
     * @method registerSettingsMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
    registerSettingsMenuItem(menuItemOrTitle, options = {}) {
        this.menuService.registerSettingsMenuItem(menuItemOrTitle, options);
    }

    /**
     * Register a menu item to a custom registry
     * 
     * @method registerMenuItem
     * @param {String} registryName Registry name
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {String|Object} routeOrOptions Route or options
     * @param {Object} options Optional options
     */
    registerMenuItem(registryName, menuItemOrTitle, routeOrOptions = {}, options = {}) {
        this.menuService.registerMenuItem(registryName, menuItemOrTitle, routeOrOptions, options);
    }

    /**
     * Get header menu items
     * 
     * @computed headerMenuItems
     * @returns {Array} Header menu items
     */
    get headerMenuItems() {
        return this.menuService.getHeaderMenuItems();
    }

    /**
     * Get organization menu items
     * 
     * @computed organizationMenuItems
     * @returns {Array} Organization menu items
     */
    get organizationMenuItems() {
        return this.menuService.getOrganizationMenuItems();
    }

    /**
     * Get user menu items
     * 
     * @computed userMenuItems
     * @returns {Array} User menu items
     */
    get userMenuItems() {
        return this.menuService.getUserMenuItems();
    }

    /**
     * Get admin menu items
     * 
     * @computed adminMenuItems
     * @returns {Array} Admin menu items
     */
    get adminMenuItems() {
        return this.menuService.getAdminMenuItems();
    }

    /**
     * Get admin menu panels
     * 
     * @computed adminMenuPanels
     * @returns {Array} Admin menu panels
     */
    get adminMenuPanels() {
        return this.menuService.getAdminMenuPanels();
    }

    // ============================================================================
    // Widget Management (delegates to WidgetService)
    // ============================================================================

    /**
     * Register default dashboard widgets
     * 
     * @method registerDefaultDashboardWidgets
     * @param {Array<Widget>} widgets Array of widgets
     */
    registerDefaultDashboardWidgets(widgets) {
        this.widgetService.registerDefaultDashboardWidgets(widgets);
    }

    /**
     * Register dashboard widgets
     * 
     * @method registerDashboardWidgets
     * @param {Array<Widget>} widgets Array of widgets
     */
    registerDashboardWidgets(widgets) {
        this.widgetService.registerDashboardWidgets(widgets);
    }

    /**
     * Register a dashboard
     * 
     * @method registerDashboard
     * @param {String} name Dashboard name
     * @param {Object} options Dashboard options
     */
    registerDashboard(name, options = {}) {
        this.widgetService.registerDashboard(name, options);
    }

    /**
     * Get dashboard widgets
     * 
     * @computed dashboardWidgets
     * @returns {Object} Dashboard widgets object
     */
    get dashboardWidgets() {
        return {
            defaultWidgets: this.widgetService.getDefaultWidgets(),
            widgets: this.widgetService.getWidgets()
        };
    }

    // ============================================================================
    // Hook Management (delegates to HookService)
    // ============================================================================

    /**
     * Register a hook
     * 
     * @method registerHook
     * @param {Hook|String} hookOrName Hook instance or name
     * @param {Function} handler Optional handler
     * @param {Object} options Optional options
     */
    registerHook(hookOrName, handler = null, options = {}) {
        this.hookService.registerHook(hookOrName, handler, options);
    }

    /**
     * Execute hooks
     * 
     * @method executeHook
     * @param {String} hookName Hook name
     * @param {...*} args Arguments to pass to hooks
     * @returns {Promise<Array>} Array of hook results
     */
    async executeHook(hookName, ...args) {
        return this.hookService.execute(hookName, ...args);
    }

    /**
     * Get hooks
     * 
     * @computed hooks
     * @returns {Object} Hooks object
     */
    get hooks() {
        return this.hookService.hooks;
    }

    // ============================================================================
    // Utility Methods
    // ============================================================================

    /**
     * Get view from transition
     * 
     * @method getViewFromTransition
     * @param {Object} transition Transition object
     * @returns {String|null} View parameter
     */
    getViewFromTransition(transition) {
        const queryParams = transition.to?.queryParams ?? { view: null };
        return queryParams.view;
    }

    /**
     * Virtual route redirect
     * Handles redirecting to menu items based on URL slug
     * 
     * @method virtualRouteRedirect
     * @param {Object} transition Transition object
     * @param {String} registryName Registry name
     * @param {String} route Route name
     * @param {Object} options Options
     * @returns {Promise} Transition promise
     */
    async virtualRouteRedirect(transition, registryName, route, options = {}) {
        const view = this.getViewFromTransition(transition);
        const slug = window.location.pathname.replace('/', '');
        const queryParams = this.urlSearchParams.all();
        const menuItem = this.lookupMenuItemFromRegistry(registryName, slug, view);
        
        if (menuItem && transition.from === null) {
            return this.transitionMenuItem(route, menuItem, { queryParams }).then((transition) => {
                if (options && options.restoreQueryParams === true) {
                    this.urlSearchParams.setParamsToCurrentUrl(queryParams);
                }
                return transition;
            });
        }
    }

    /**
     * Transition to a menu item
     * Handles section, slug, and view parameters for virtual routes
     * 
     * @method transitionMenuItem
     * @param {String} route Route name
     * @param {Object} menuItem Menu item object with slug, view, and optional section
     * @returns {Transition} The router transition
     */
    @action
    transitionMenuItem(route, menuItem) {
        const { slug, view, section } = menuItem;

        if (section && slug && view) {
            return this.router.transitionTo(route, section, slug, { queryParams: { view } });
        }

        if (section && slug) {
            return this.router.transitionTo(route, section, slug);
        }

        if (slug && view) {
            return this.router.transitionTo(route, slug, { queryParams: { view } });
        }

        return this.router.transitionTo(route, slug);
    }

    /**
     * Register a boot callback
     * 
     * @method onBoot
     * @param {Function} callback Callback function
     */
    onBoot(callback) {
        if (typeof callback === 'function') {
            this.bootCallbacks.pushObject(callback);
        }
    }

    /**
     * Execute boot callbacks
     * 
     * @method executeBootCallbacks
     */
    async executeBootCallbacks() {
        for (const callback of this.bootCallbacks) {
            try {
                await callback(this);
            } catch (error) {
                console.error('Error executing boot callback:', error);
            }
        }
        
        // Mark boot as complete
        this.extensionManager.finishBoot();
    }

    // ============================================================================
    // Backward Compatibility Methods
    // ============================================================================

    /**
     * Get menu items from a registry
     * Backward compatibility facade
     * 
     * @method getMenuItemsFromRegistry
     * @param {String} registryName Registry name
     * @returns {Array} Menu items
     */
    getMenuItemsFromRegistry(registryName) {
        return this.registryService.getRegistry(registryName) || A([]);
    }

    /**
     * Get menu panels from a registry
     * Backward compatibility facade
     * 
     * @method getMenuPanelsFromRegistry
     * @param {String} registryName Registry name
     * @returns {Array} Menu panels
     */
    getMenuPanelsFromRegistry(registryName) {
        return this.registryService.getRegistry(`${registryName}:panels`) || A([]);
    }

    /**
     * Lookup a menu item from a registry
     * Backward compatibility facade
     * 
     * @method lookupMenuItemFromRegistry
     * @param {String} registryName Registry name
     * @param {String} slug Menu item slug
     * @param {String} view Optional view
     * @param {String} section Optional section
     * @returns {Object|null} Menu item or null
     */
    lookupMenuItemFromRegistry(registryName, slug, view = null, section = null) {
        const items = this.getMenuItemsFromRegistry(registryName);
        return items.find(item => {
            const slugMatch = item.slug === slug;
            const viewMatch = !view || item.view === view;
            const sectionMatch = !section || item.section === section;
            return slugMatch && viewMatch && sectionMatch;
        });
    }

    /**
     * Create a registry event
     * Backward compatibility facade
     * 
     * @method createRegistryEvent
     * @param {String} registryName Registry name
     * @param {String} eventName Event name
     * @param {...*} args Event arguments
     */
    createRegistryEvent(registryName, eventName, ...args) {
        this.trigger(`${registryName}:${eventName}`, ...args);
    }

    /**
     * Register after boot callback
     * Backward compatibility facade
     * 
     * @method afterBoot
     * @param {Function} callback Callback function
     */
    afterBoot(callback) {
        this.extensionManager.afterBoot(callback);
    }

    /**
     * Create a menu item (internal helper)
     * Backward compatibility helper
     * 
     * @method _createMenuItem
     * @param {String} title Menu item title
     * @param {String} route Menu item route
     * @param {Object} options Menu item options
     * @returns {Object} Menu item object
     */
    _createMenuItem(title, route = null, options = {}) {
        const menuItem = new MenuItem(title, route);
        
        if (options.icon) menuItem.withIcon(options.icon);
        if (options.component) menuItem.withComponent(options.component);
        if (options.slug) menuItem.withSlug(options.slug);
        if (options.section) menuItem.inSection(options.section);
        if (options.priority) menuItem.withPriority(options.priority);
        if (options.type) menuItem.withType(options.type);
        if (options.wrapperClass) menuItem.withWrapperClass(options.wrapperClass);
        if (options.queryParams) menuItem.withQueryParams(options.queryParams);
        if (options.onClick) menuItem.onClick(options.onClick);
        
        return menuItem.toObject();
    }

    /**
     * Legacy method for registering renderable components
     * Maintained for backward compatibility
     * 
     * @method registerRenderableComponent
     * @param {String} engineName Engine name
     * @param {String} registryName Registry name
     * @param {*} component Component
     */
    registerRenderableComponent(engineName, registryName, component) {
        this.registryService.register(registryName, engineName, component);
    }

    /**
     * Legacy method for registering components in engines
     * Maintained for backward compatibility
     * 
     * @method registerComponentInEngine
     * @param {String} engineName Engine name
     * @param {*} componentClass Component class
     * @param {Object} options Options
     */
    async registerComponentInEngine(engineName, componentClass, options = {}) {
        const engineInstance = await this.ensureEngineLoaded(engineName);
        
        if (engineInstance && componentClass && typeof componentClass.name === 'string') {
            const dasherized = componentClass.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
            engineInstance.register(`component:${componentClass.name}`, componentClass);
            engineInstance.register(`component:${dasherized}`, componentClass);
            
            if (options.registerAs) {
                engineInstance.register(`component:${options.registerAs}`, componentClass);
            }
        }
    }
}

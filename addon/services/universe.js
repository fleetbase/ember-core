import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { getOwner } from '@ember/application';
import { A } from '@ember/array';

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

    @tracked applicationInstance;
    @tracked initialLocation = { ...window.location };
    @tracked bootCallbacks = A([]);

    /**
     * Initialize the service
     */
    constructor() {
        super(...arguments);
        this.applicationInstance = getOwner(this);
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
        return this.menuService.getAdminPanels();
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
     * Transition to a menu item
     * 
     * @method transitionMenuItem
     * @param {String} route Route name
     * @param {Object} menuItem Menu item object
     */
    @action
    transitionMenuItem(route, menuItem) {
        if (menuItem.route) {
            this.router.transitionTo(menuItem.route, ...menuItem.routeParams, {
                queryParams: menuItem.queryParams
            });
        } else {
            this.router.transitionTo(route, menuItem.slug, {
                queryParams: menuItem.queryParams
            });
        }
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

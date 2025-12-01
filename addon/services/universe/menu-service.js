import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { dasherize } from '@ember/string';
import { A } from '@ember/array';
import MenuItem from '../../contracts/menu-item';
import MenuPanel from '../../contracts/menu-panel';

/**
 * MenuService
 * 
 * Manages all menu items and panels in the application.
 * Uses RegistryService for storage, providing cross-engine access.
 * 
 * @class MenuService
 * @extends Service
 */
export default class MenuService extends Service {
    @service('universe/registry-service') registryService;

    /**
     * Normalize a menu item input to a plain object
     * 
     * @private
     * @method #normalizeMenuItem
     * @param {MenuItem|String|Object} input MenuItem instance, title, or object
     * @param {String} route Optional route
     * @param {Object} options Optional options
     * @returns {Object} Normalized menu item object
     */
    #normalizeMenuItem(input, route = null, options = {}) {
        if (input instanceof MenuItem) {
            return input.toObject();
        }

        if (typeof input === 'object' && input !== null && !input.title) {
            return input;
        }

        if (typeof input === 'string') {
            const menuItem = new MenuItem(input, route);
            
            // Apply options
            Object.keys(options).forEach(key => {
                if (key === 'icon') menuItem.withIcon(options[key]);
                else if (key === 'priority') menuItem.withPriority(options[key]);
                else if (key === 'component') menuItem.withComponent(options[key]);
                else if (key === 'slug') menuItem.withSlug(options[key]);
                else if (key === 'section') menuItem.inSection(options[key]);
                else if (key === 'index') menuItem.atIndex(options[key]);
                else if (key === 'type') menuItem.withType(options[key]);
                else if (key === 'wrapperClass') menuItem.withWrapperClass(options[key]);
                else if (key === 'queryParams') menuItem.withQueryParams(options[key]);
                else if (key === 'onClick') menuItem.onClick(options[key]);
                else menuItem.setOption(key, options[key]);
            });

            return menuItem.toObject();
        }

        return input;
    }

    /**
     * Normalize a menu panel input to a plain object
     * 
     * @private
     * @method #normalizeMenuPanel
     * @param {MenuPanel|String|Object} input MenuPanel instance, title, or object
     * @param {Array} items Optional items
     * @param {Object} options Optional options
     * @returns {Object} Normalized menu panel object
     */
    #normalizeMenuPanel(input, items = [], options = {}) {
        if (input instanceof MenuPanel) {
            return input.toObject();
        }

        if (typeof input === 'object' && input !== null && !input.title) {
            return input;
        }

        if (typeof input === 'string') {
            const panel = new MenuPanel(input, items);
            
            if (options.slug) panel.withSlug(options.slug);
            if (options.icon) panel.withIcon(options.icon);
            if (options.priority) panel.withPriority(options.priority);

            return panel.toObject();
        }

        return input;
    }

    // ============================================================================
    // Registration Methods
    // ============================================================================

    /**
     * Register a header menu item
     * 
     * @method registerHeaderMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {String} route Optional route (if first param is string)
     * @param {Object} options Optional options (if first param is string)
     */
	    registerHeaderMenuItem(menuItemOrTitle, route = null, options = {}) {
	        const menuItem = this.#normalizeMenuItem(menuItemOrTitle, route, options);
	        // Assuming global header menu items should use a dynamic registry for now
	        this.registryService.register('header-menu', 'items', `header:${menuItem.slug}`, menuItem);
	    }

    /**
     * Register an organization menu item
     * 
     * @method registerOrganizationMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
	    registerOrganizationMenuItem(menuItemOrTitle, options = {}) {
	        const menuItem = this.#normalizeMenuItem(
	            menuItemOrTitle,
	            options.route || 'console.virtual',
	            options
	        );
	
	        if (!menuItem.section) {
	            menuItem.section = 'settings';
	        }
	
	        // Maps to consoleAccountRegistry.menuItems
	        this.registryService.register('console:account', 'menuItems', `organization:${menuItem.slug}`, menuItem);
	    }

    /**
     * Register a user menu item
     * 
     * @method registerUserMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
	    registerUserMenuItem(menuItemOrTitle, options = {}) {
	        const menuItem = this.#normalizeMenuItem(
	            menuItemOrTitle,
	            options.route || 'console.virtual',
	            options
	        );
	
	        if (!menuItem.section) {
	            menuItem.section = 'account';
	        }
	
	        // Maps to consoleAccountRegistry.menuItems
	        this.registryService.register('console:account', 'menuItems', `user:${menuItem.slug}`, menuItem);
	    }

    /**
     * Register an admin menu panel
     * 
     * @method registerAdminMenuPanel
     * @param {MenuPanel|String} panelOrTitle MenuPanel instance or title
     * @param {Array} items Optional items array (if first param is string)
     * @param {Object} options Optional options (if first param is string)
     */
	    registerAdminMenuPanel(panelOrTitle, items = [], options = {}) {
	        const panel = this.#normalizeMenuPanel(panelOrTitle, items, options);
	        // Maps to consoleAdminRegistry.menuPanels
	        this.registryService.register('console:admin', 'menuPanels', panel.slug, panel);
	
	        // The PDF states: "Additionally registering menu panels should also register there items."
	        // We assume the items are passed in the panel object or items array.
	        if (panel.items && panel.items.length) {
	            panel.items.forEach(item => {
	                const menuItem = this.#normalizeMenuItem(item);
	                // Register item to consoleAdminRegistry.menuItems
	                this.registryService.register('console:admin', 'menuItems', menuItem.slug, menuItem);
	            });
	        }
	    }

    /**
     * Register a settings menu item
     * 
     * @method registerSettingsMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
	    registerSettingsMenuItem(menuItemOrTitle, options = {}) {
	        const menuItem = this.#normalizeMenuItem(
	            menuItemOrTitle,
	            options.route || 'console.settings.virtual',
	            options
	        );
	
	        // Maps to consoleSettingsRegistry.menuItems
	        this.registryService.register('console:settings', 'menuItems', menuItem.slug, menuItem);
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
	        const isOptionsObject = typeof routeOrOptions === 'object';
	        const route = isOptionsObject ? routeOrOptions.route : routeOrOptions;
	        const opts = isOptionsObject ? routeOrOptions : options;
	
	        const menuItem = this.#normalizeMenuItem(menuItemOrTitle, route, opts);
	        
	        // For custom registries, we use the dynamic registry fallback with a default list name 'items'
	        this.registryService.register(registryName, 'items', menuItem.slug || menuItem.title, menuItem);
	    }

    // ============================================================================
    // Getter Methods (Improved DX)
    // ============================================================================

    /**
     * Get menu items from a registry
     * 
     * @method getMenuItems
     * @param {String} registryName Registry name (e.g., 'engine:fleet-ops')
     * @returns {Array} Menu items
     */
	    getMenuItems(registryName) {
	        // For dynamic registries, getRegistry(name) returns the dynamic array
	        // For fixed registries, we assume the caller wants the 'menuItems' list
	        if (registryName === 'header-menu') {
	            return this.registryService.getRegistry(registryName);
	        }
	        return this.registryService.getRegistry(registryName, 'menuItems');
	    }

    /**
     * Get menu panels from a registry
     * 
     * @method getMenuPanels
     * @param {String} registryName Registry name (e.g., 'engine:fleet-ops')
     * @returns {Array} Menu panels
     */
	    getMenuPanels(registryName) {
	        // For fixed registries, we assume the caller wants the 'menuPanels' list
	        return this.registryService.getRegistry(registryName, 'menuPanels');
	    }

    /**
     * Lookup a menu item from a registry
     * 
     * @method lookupMenuItem
     * @param {String} registryName Registry name
     * @param {String} slug Menu item slug
     * @param {String} view Optional view
     * @param {String} section Optional section
     * @returns {Object|null} Menu item or null
     */
    lookupMenuItem(registryName, slug, view = null, section = null) {
        const items = this.getMenuItems(registryName);
        return items.find(item => {
            const slugMatch = item.slug === slug;
            const viewMatch = !view || item.view === view;
            const sectionMatch = !section || item.section === section;
            return slugMatch && viewMatch && sectionMatch;
        });
    }

    /**
     * Alias for lookupMenuItem
     * 
     * @method getMenuItem
     * @param {String} registryName Registry name
     * @param {String} slug Menu item slug
     * @param {String} view Optional view
     * @param {String} section Optional section
     * @returns {Object|null} Menu item or null
     */
    getMenuItem(registryName, slug, view = null, section = null) {
        return this.lookupMenuItem(registryName, slug, view, section);
    }

    /**
     * Get header menu items
     * 
     * @method getHeaderMenuItems
     * @returns {Array} Header menu items sorted by priority
     */
	    getHeaderMenuItems() {
	        // Uses the dynamic registry 'header-menu'
	        const items = this.registryService.getRegistry('header-menu');
	        return A(items).sortBy('priority');
	    }

    /**
     * Get organization menu items
     * 
     * @method getOrganizationMenuItems
     * @returns {Array} Organization menu items
     */
	    getOrganizationMenuItems() {
	        // Maps to consoleAccountRegistry.menuItems
	        return this.registryService.getRegistry('console:account', 'menuItems');
	    }

    /**
     * Get user menu items
     * 
     * @method getUserMenuItems
     * @returns {Array} User menu items
     */
	    getUserMenuItems() {
	        // Maps to consoleAccountRegistry.menuItems
	        return this.registryService.getRegistry('console:account', 'menuItems');
	    }

    /**
     * Get admin menu panels
     * 
     * @method getAdminMenuPanels
     * @returns {Array} Admin panels sorted by priority
     */
	    getAdminMenuPanels() {
	        // Maps to consoleAdminRegistry.menuPanels
	        const panels = this.registryService.getRegistry('console:admin', 'menuPanels');
	        return A(panels).sortBy('priority');
	    }

    /**
     * Alias for getAdminMenuPanels
     * 
     * @method getAdminPanels
     * @returns {Array} Admin panels
     */
    getAdminPanels() {
        return this.getAdminMenuPanels();
    }

    /**
     * Get admin menu items
     * 
     * @method getAdminMenuItems
     * @returns {Array} Admin menu items
     */
    getAdminMenuItems() {
        return this.registryService.getAllFromPrefix('menu-item', 'admin:');
    }

    /**
     * Get settings menu items
     * 
     * @method getSettingsMenuItems
     * @returns {Array} Settings menu items
     */
 	    getAdminMenuItems() {
	        // Maps to consoleAdminRegistry.menuItems
	        return this.registryService.getRegistry('console:admin', 'menuItems');
	    } }

    /**
     * Get settings menu panels
     * 
     * @method getSettingsMenuPanels
     * @returns {Array} Settings menu panels
   	    getSettingsMenuItems() {
	        // Maps to consoleSettingsRegistry.menuItems
	        return this.registryService.getRegistry('console:settings', 'menuItems');
	    }
    // ============================================================================
    // Computed Getters (for template access)
    // ============================================================================

    /**
     * Get header menu items (computed getter)
     * 
     * @computed headerMenuItems
     * @returns {Array} Header menu items
     */
    get headerMenuItems() {
        return this.getHeaderMenuItems();
    }

    /**
     * Get organization menu items (computed getter)
     * 
     * @computed organizationMenuItems
     * @returns {Array} Organization menu items
     */
    get organizationMenuItems() {
        return this.getOrganizationMenuItems();
    }

    /**
     * Get user menu items (computed getter)
     * 
     * @computed userMenuItems
     * @returns {Array} User menu items
     */
    get userMenuItems() {
        return this.getUserMenuItems();
    }

    /**
     * Get admin menu items (computed getter)
     * 
     * @computed adminMenuItems
     * @returns {Array} Admin menu items
     */
    get adminMenuItems() {
        return this.getAdminMenuItems();
    }

    /**
     * Get admin menu panels (computed getter)
     * 
     * @computed adminMenuPanels
     * @returns {Array} Admin menu panels
     */
    get adminMenuPanels() {
        return this.getAdminMenuPanels();
    }

    /**
     * Get settings menu items (computed getter)
     * 
     * @computed settingsMenuItems
     * @returns {Array} Settings menu items
     */
    get settingsMenuItems() {
        return this.getSettingsMenuItems();
    }

    /**
     * Get settings menu panels (computed getter)
     * 
     * @computed settingsMenuPanels
     * @returns {Array} Settings menu panels
     */
    get settingsMenuPanels() {
        return this.getSettingsMenuPanels();
    }
}

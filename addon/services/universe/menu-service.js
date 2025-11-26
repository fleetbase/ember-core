import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A } from '@ember/array';
import { dasherize } from '@ember/string';
import MenuItem from '../../contracts/menu-item';
import MenuPanel from '../../contracts/menu-panel';

/**
 * MenuService
 * 
 * Manages all menu items and panels in the application.
 * Handles header menus, organization menus, user menus, admin panels, etc.
 * 
 * @class MenuService
 * @extends Service
 */
export default class MenuService extends Service {
    @service('universe/registry-service') registryService;

    @tracked headerMenuItems = A([]);
    @tracked organizationMenuItems = A([]);
    @tracked userMenuItems = A([]);

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
        
        this.headerMenuItems.pushObject(menuItem);
        this.headerMenuItems = this.headerMenuItems.sortBy('priority');
        
        // Also register in registry for lookup
        this.registryService.register('menu-item', `header:${menuItem.slug}`, menuItem);
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

        this.organizationMenuItems.pushObject(menuItem);
        
        this.registryService.register('menu-item', `organization:${menuItem.slug}`, menuItem);
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

        this.userMenuItems.pushObject(menuItem);
        
        this.registryService.register('menu-item', `user:${menuItem.slug}`, menuItem);
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
        
        this.registryService.register('admin-panel', panel.slug, panel);
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

        this.registryService.register('settings-menu-item', menuItem.slug, menuItem);
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
        
        this.registryService.register(registryName, menuItem.slug || menuItem.title, menuItem);
    }

    /**
     * Get header menu items
     * 
     * @method getHeaderMenuItems
     * @returns {Array} Header menu items
     */
    getHeaderMenuItems() {
        return this.headerMenuItems;
    }

    /**
     * Get organization menu items
     * 
     * @method getOrganizationMenuItems
     * @returns {Array} Organization menu items
     */
    getOrganizationMenuItems() {
        return this.organizationMenuItems;
    }

    /**
     * Get user menu items
     * 
     * @method getUserMenuItems
     * @returns {Array} User menu items
     */
    getUserMenuItems() {
        return this.userMenuItems;
    }

    /**
     * Get admin panels
     * 
     * @method getAdminPanels
     * @returns {Array} Admin panels
     */
    getAdminPanels() {
        return this.registryService.getRegistry('admin-panel');
    }

    /**
     * Get settings menu items
     * 
     * @method getSettingsMenuItems
     * @returns {Array} Settings menu items
     */
    getSettingsMenuItems() {
        return this.registryService.getRegistry('settings-menu-item');
    }


}

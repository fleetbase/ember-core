import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
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
export default class MenuService extends Service.extend(Evented) {
    @service('universe/registry-service') registryService;
    @service universe;
    @tracked applicationInstance;

    /**
     * Set the application instance (for consistency with other services)
     *
     * @method setApplicationInstance
     * @param {Application} application The root application instance
     */
    setApplicationInstance(application) {
        this.applicationInstance = application;
    }

    /**
     * Wrap an onClick handler to automatically pass menuItem and universe as parameters
     *
     * @private
     * @method #wrapOnClickHandler
     * @param {Function} onClick The original onClick function
     * @param {Object} menuItem The menu item object
     * @returns {Function} Wrapped onClick function
     */
    #wrapOnClickHandler(onClick, menuItem) {
        if (typeof onClick !== 'function') {
            return onClick;
        }

        const universe = this.universe;
        return function () {
            return onClick(menuItem, universe);
        };
    }

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
        let menuItemObj;

        if (input instanceof MenuItem) {
            menuItemObj = input.toObject();
        } else if (typeof input === 'object' && input !== null && !input.title) {
            menuItemObj = input;
        } else if (typeof input === 'string') {
            const menuItem = new MenuItem(input, route);

            // Apply options
            Object.keys(options).forEach((key) => {
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

            menuItemObj = menuItem.toObject();
        } else {
            menuItemObj = input;
        }

        // Wrap onClick handler to automatically pass menuItem and universe
        if (menuItemObj && typeof menuItemObj.onClick === 'function') {
            menuItemObj.onClick = this.#wrapOnClickHandler(menuItemObj.onClick, menuItemObj);
        }

        return menuItemObj;
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
    registerHeaderMenuItem(itemOrTitle, route = null, options = {}) {
        const menuItem = this.#normalizeMenuItem(itemOrTitle, route, options);
        this.registryService.register('header', 'menu-item', menuItem.slug, menuItem);

        // Trigger event for backward compatibility
        this.trigger('menuItem.registered', menuItem, 'header');
    }

    /**
     * Register an admin menu item
     *
     * @method registerAdminMenuItem
     * @param {MenuItem|String} itemOrTitle MenuItem instance or title
     * @param {String} route Optional route (if first param is string)
     * @param {Object} options Optional options (if first param is string)
     */
    registerAdminMenuItem(itemOrTitle, route = null, options = {}) {
        const menuItem = this.#normalizeMenuItem(itemOrTitle, route, options);
        this.registryService.register('console:admin', 'menu-item', menuItem.slug, menuItem);

        // Trigger event for backward compatibility
        this.trigger('menuItem.registered', menuItem, 'console:admin');
    }

    /**
     * Register an organization menu item
     *
     * @method registerOrganizationMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
    registerOrganizationMenuItem(menuItemOrTitle, options = {}) {
        const menuItem = this.#normalizeMenuItem(menuItemOrTitle, options.route || 'console.virtual', options);

        if (!menuItem.section) {
            menuItem.section = 'settings';
        }

        this.registryService.register('console:account', 'menu-item', `organization:${menuItem.slug}`, menuItem);
    }

    /**
     * Register a user menu item
     *
     * @method registerUserMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
    registerUserMenuItem(menuItemOrTitle, options = {}) {
        const menuItem = this.#normalizeMenuItem(menuItemOrTitle, options.route || 'console.virtual', options);

        if (!menuItem.section) {
            menuItem.section = 'account';
        }

        this.registryService.register('console:account', 'menu-item', `user:${menuItem.slug}`, menuItem);
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
        this.registryService.register('console:admin', 'menu-panel', panel.slug, panel);

        // The PDF states: "Additionally registering menu panels should also register there items."
        // We assume the items are passed in the panel object or items array.
        if (panel.items && panel.items.length) {
            panel.items = panel.items.map((item) => {
                const menuItem = this.#normalizeMenuItem(item);

                // CRITICAL: Original behavior for panel items:
                // - slug = panel slug (e.g., 'fleet-ops') ← Used in URL
                // - view = item slug (e.g., 'navigator-app') ← Used in query param
                // - section = null (not used for panel items)
                // Result: /admin/fleet-ops?view=navigator-app

                const itemSlug = menuItem.slug; // Save the original item slug
                menuItem.slug = panel.slug; // Set slug to panel slug for URL
                menuItem.view = itemSlug; // Set view to item slug for query param
                menuItem.section = null; // Panel items don't use section

                // Mark as panel item to prevent duplication in main menu
                menuItem._isPanelItem = true;
                menuItem._panelSlug = panel.slug;

                // Register with the item slug as key (for lookup)
                this.registryService.register('console:admin', 'menu-item', itemSlug, menuItem);

                // Trigger event for backward compatibility
                this.trigger('menuItem.registered', menuItem, 'console:admin');

                // Return the modified menu item so panel.items gets updated
                return menuItem;
            });
        }

        // Trigger event for backward compatibility
        this.trigger('menuPanel.registered', panel, 'console:admin');
    }

    /**
     * Register a settings menu item
     *
     * @method registerSettingsMenuItem
     * @param {MenuItem|String} menuItemOrTitle MenuItem instance or title
     * @param {Object} options Optional options
     */
    registerSettingsMenuItem(menuItemOrTitle, options = {}) {
        const menuItem = this.#normalizeMenuItem(menuItemOrTitle, options.route || 'console.settings.virtual', options);

        this.registryService.register('console:settings', 'menu-item', menuItem.slug, menuItem);
    }

    /**
     * Register a menu item to a custom registry
     *
     * Supports two patterns:
     * 1. Original: registerMenuItem(registryName, title, options)
     * 2. New: registerMenuItem(registryName, menuItemInstance)
     *
     * @method registerMenuItem
     * @param {String} registryName Registry name (e.g., 'auth:login', 'engine:fleet-ops')
     * @param {String|MenuItem} titleOrMenuItem Menu item title string or MenuItem instance
     * @param {Object} options Optional options (only used with title string)
     */
    registerMenuItem(registryName, titleOrMenuItem, options = {}) {
        let menuItem;

        // Normalize the menu item first (handles both MenuItem instances and string titles)
        if (titleOrMenuItem instanceof MenuItem) {
            menuItem = this.#normalizeMenuItem(titleOrMenuItem);
        } else {
            // Original pattern: title string + options
            const title = titleOrMenuItem;
            const route = options.route || `console.${dasherize(registryName)}.virtual`;

            // Set defaults matching original behavior
            const slug = options.slug || '~';

            menuItem = this.#normalizeMenuItem(title, route, {
                ...options,
                slug,
            });
        }

        // Apply finalView normalization consistently for ALL menu items
        // If slug === view, set view to null to prevent redundant query params
        // This matches the legacy behavior: const finalView = (slug === view) ? null : view;
        if (menuItem.slug && menuItem.view && menuItem.slug === menuItem.view) {
            menuItem.view = null;
        }

        // Register the menu item
        this.registryService.register(registryName, 'menu-item', menuItem.slug || menuItem.title, menuItem);

        // Trigger event
        this.trigger('menuItem.registered', menuItem, registryName);
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
        return this.registryService.getRegistry(registryName, 'menu-item');
    }

    /**
     * Get menu panels from a registry
     *
     * @method getMenuPanels
     * @param {String} registryName Registry name (e.g., 'engine:fleet-ops')
     * @returns {Array} Menu panels
     */
    getMenuPanels(registryName) {
        return this.registryService.getRegistry(registryName, 'menu-panel');
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
        return items.find((item) => {
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
        const items = this.registryService.getRegistry('header', 'menu-item');
        return A(items).sortBy('priority');
    }

    /**
     * Get organization menu items
     *
     * @method getOrganizationMenuItems
     * @returns {Array} Organization menu items
     */
    getOrganizationMenuItems() {
        return this.registryService.getRegistry('console:account', 'menu-item');
    }

    /**
     * Get user menu items
     *
     * @method getUserMenuItems
     * @returns {Array} User menu items
     */
    getUserMenuItems() {
        return this.registryService.getRegistry('console:account', 'menu-item');
    }

    /**
     * Get admin menu panels
     *
     * @method getAdminMenuPanels
     * @returns {Array} Admin panels sorted by priority
     */
    getAdminMenuPanels() {
        const panels = this.registryService.getRegistry('console:admin', 'menu-panel');
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
     * Excludes items that belong to panels (to prevent duplication)
     *
     * @method getAdminMenuItems
     * @returns {Array} Admin menu items (excluding panel items)
     */
    getAdminMenuItems() {
        const items = this.registryService.getRegistry('console:admin', 'menu-item');
        // Filter out panel items to prevent duplication in the UI
        return items.filter((item) => !item._isPanelItem);
    }

    /**
     * Get menu items from a specific panel
     *
     * @method getMenuItemsFromPanel
     * @param {String} panelSlug Panel slug
     * @returns {Array} Menu items belonging to the panel
     */
    getMenuItemsFromPanel(panelSlug) {
        const items = this.registryService.getRegistry('console:admin', 'menu-item');
        return items.filter((item) => item._panelSlug === panelSlug);
    }

    /**
     * Get settings menu items
     *
     * @method getSettingsMenuItems
     * @returns {Array} Settings menu items
     */
    getSettingsMenuItems() {
        return this.registryService.getRegistry('console:settings', 'menu-item');
    }

    /**
     * Get settings menu panels
     *
     * @method getSettingsMenuPanels
     * @returns {Array} Settings menu panels
     */
    getSettingsMenuPanels() {
        const panels = this.registryService.getRegistry('console:settings', 'menu-panel');
        return A(panels).sortBy('priority');
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

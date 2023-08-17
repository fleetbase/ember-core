import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { computed, action } from '@ember/object';
import { isBlank } from '@ember/utils';
import { isArray } from '@ember/array';
import { dasherize } from '@ember/string';
import { getOwner } from '@ember/application';
import { assert } from '@ember/debug';
import RSVP from 'rsvp';

export default class UniverseService extends Service.extend(Evented) {
    @service router;
    @service intl;
    @tracked headerMenuItems = [];
    @tracked organizationMenuItems = [];
    @tracked userMenuItems = [];
    @tracked adminRegistry = {
        menuItems: [],
        menuPanels: [],
    };
    @tracked accountRegistry = {
        menuItems: [],
        menuPanels: [],
    };
    @tracked settingsRegistry = {
        menuItems: [],
        menuPanels: [],
    };

    /**
     * Computed property that returns all administrative menu items.
     *
     * @computed adminMenuItems
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu items
     */
    @computed('adminRegistry.menuItems.[]') get adminMenuItems() {
        return this.adminRegistry.menuItems;
    }

    /**
     * Computed property that returns all administrative menu panels.
     *
     * @computed adminMenuPanels
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu panels
     */
    @computed('adminRegistry.menuPanels.[]') get adminMenuPanels() {
        return this.adminRegistry.menuPanels;
    }

    /**
     * Computed property that returns all settings menu items.
     *
     * @computed settingsMenuItems
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu items
     */
    @computed('settingsRegistry.menuItems.[]') get settingsMenuItems() {
        return this.settingsRegistry.menuItems;
    }

    /**
     * Computed property that returns all settings menu panels.
     *
     * @computed settingsMenuPanels
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu panels
     */
    @computed('settingsRegistry.menuPanels.[]') get settingsMenuPanels() {
        return this.settingsRegistry.menuPanels;
    }

    /**
     * Action to transition to a specified route based on the provided menu item.
     *
     * The route transition will include the 'slug' as a dynamic segment, and
     * the 'view' as an optional dynamic segment if it is defined.
     *
     * @action
     * @memberof UniverseService
     * @param {string} route - The target route to transition to.
     * @param {Object} menuItem - The menu item containing the transition parameters.
     * @param {string} menuItem.slug - The 'slug' dynamic segment for the route.
     * @param {string} [menuItem.view] - The 'view' dynamic segment for the route, if applicable.
     *
     * @returns {Transition} Returns a Transition object representing the transition to the route.
     */
    @action transitionMenuItem(route, menuItem) {
        const { slug, view } = menuItem;

        if (view) {
            return this.router.transitionTo(route, slug, view);
        }

        return this.router.transitionTo(route, slug, 'index');
    }

    /**
     * Loads a component from the specified registry based on a given slug and view.
     *
     * @param {string} registryName - The name of the registry where the component is located.
     * @param {string} slug - The slug of the menu item.
     * @param {string} [view=null] - The view of the menu item, if applicable.
     *
     * @returns {Promise} Returns a Promise that resolves with the component if it is found, or null.
     */
    loadComponentFromRegistry(registryName, slug, view = null) {
        const registry = this[`${registryName}Registry`];

        if (isBlank(registry)) {
            return null;
        }

        return new Promise((resolve) => {
            let component = null;

            // check menu items first
            for (let i = 0; i < registry.menuItems.length; i++) {
                const menuItem = registry.menuItems[i];

                // no view hack
                if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                    component = menuItem.component;
                    break;
                }

                if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                    component = menuItem.component;
                    break;
                }
            }

            // check menu panels
            for (let i = 0; i < registry.menuPanels.length; i++) {
                const menuPanel = registry.menuPanels[i];

                if (menuPanel && isArray(menuPanel.items)) {
                    for (let j = 0; j < menuPanel.items.length; j++) {
                        const menuItem = menuPanel.items[j];

                        // no view hack
                        if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                            component = menuItem.component;
                            break;
                        }

                        if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                            component = menuItem.component;
                            break;
                        }
                    }
                }
            }

            resolve(component);
        });
    }

    /**
     * Looks up a menu item from the specified registry based on a given slug and view.
     *
     * @param {string} registryName - The name of the registry where the menu item is located.
     * @param {string} slug - The slug of the menu item.
     * @param {string} [view=null] - The view of the menu item, if applicable.
     *
     * @returns {Promise} Returns a Promise that resolves with the menu item if it is found, or null.
     */
    lookupMenuItemFromRegistry(registryName, slug, view = null) {
        const registry = this[`${registryName}Registry`];

        if (isBlank(registry)) {
            return null;
        }

        return new Promise((resolve) => {
            let foundMenuItem = null;

            // check menu items first
            for (let i = 0; i < registry.menuItems.length; i++) {
                const menuItem = registry.menuItems[i];

                // no view hack
                if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                    foundMenuItem = menuItem;
                    break;
                }

                if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                    foundMenuItem = menuItem;
                    break;
                }
            }

            // check menu panels
            for (let i = 0; i < registry.menuPanels.length; i++) {
                const menuPanel = registry.menuPanels[i];

                if (menuPanel && isArray(menuPanel.items)) {
                    for (let j = 0; j < menuPanel.items.length; j++) {
                        const menuItem = menuPanel.items[j];

                        // no view hack
                        if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                            foundMenuItem = menuItem;
                            break;
                        }

                        if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                            foundMenuItem = menuItem;
                            break;
                        }
                    }
                }
            }

            resolve(foundMenuItem);
        });
    }

    /**
     * Registers a new menu panel in a registry.
     *
     * @method registerMenuPanel
     * @public
     * @memberof UniverseService
     * @param {String} registryName The name of the registry to use
     * @param {String} title The title of the panel
     * @param {Array} items The items of the panel
     * @param {Object} options Additional options for the panel
     */
    registerMenuPanel(registryName, title, items = [], options = {}) {
        const open = this._getOption(options, 'open', true);
        const slug = this._getOption(options, 'slug', dasherize(title));

        this[`${registryName}Registry`].menuPanels.pushObject({
            title,
            open,
            items: items.map(({ title, route, ...options }) => {
                options.slug = slug;
                options.view = dasherize(title);

                return this._createMenuItem(title, route, options);
            }),
        });
    }

    /**
     * Registers a new menu item in a registry.
     *
     * @method registerMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} registryName The name of the registry to use
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerMenuItem(registryName, title, options = {}) {
        const route = this._getOption(options, 'route', `console.${registryName}.virtual`);
        options.slug = this._getOption(options, 'slug', '~');
        options.view = this._getOption(options, 'view', dasherize(title));

        // not really a fan of assumptions, but will do this for the timebeing till anyone complains
        if (options.slug === options.view) {
            options.view = null;
        }

        this[`${registryName}Registry`].menuItems.pushObject(this._createMenuItem(title, route, options));
    }

    /**
     * Registers a new administrative menu panel.
     *
     * @method registerAdminMenuPanel
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the panel
     * @param {Array} items The items of the panel
     * @param {Object} options Additional options for the panel
     */
    registerAdminMenuPanel(title, items = [], options = {}) {
        options.section = this._getOption(options, 'section', 'admin');
        this.registerMenuPanel('admin', title, items, options);
    }

    /**
     * Registers a new administrative menu item.
     *
     * @method registerAdminMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {Object} options Additional options for the item
     */
    registerAdminMenuItem(title, options = {}) {
        this.registerMenuItem('admin', title, options);
    }

    /**
     * Registers a new settings menu panel.
     *
     * @method registerSettingsMenuPanel
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the panel
     * @param {Array} items The items of the panel
     * @param {Object} options Additional options for the panel
     */
    registerSettingsMenuPanel(title, items = [], options = {}) {
        this.registerMenuPanel('settings', title, items, options);
    }

    /**
     * Registers a new settings menu item.
     *
     * @method registerSettingsMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {Object} options Additional options for the item
     */
    registerSettingsMenuItem(title, options = {}) {
        this.registerMenuItem('settings', title, options);
    }

    /**
     * Registers a new header menu item.
     *
     * @method registerHeaderMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerHeaderMenuItem(title, route, options = {}) {
        this.headerMenuItems.pushObject(this._createMenuItem(title, route, options));
        this.headerMenuItems.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Registers a new organization menu item.
     *
     * @method registerOrganizationMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerOrganizationMenuItem(title, options = {}) {
        const route = this._getOption(options, 'route', 'console.virtual');
        options.index = this._getOption(options, 'index', 0);
        options.section = this._getOption(options, 'section', 'settings');

        this.organizationMenuItems.pushObject(this._createMenuItem(title, route, options));
    }

    /**
     * Registers a new organization menu item.
     *
     * @method registerOrganizationMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerUserMenuItem(title, options = {}) {
        const route = this._getOption(options, 'route', 'console.virtual');
        options.index = this._getOption(options, 'index', 0);
        options.section = this._getOption(options, 'section', 'account');

        this.userMenuItems.pushObject(this._createMenuItem(title, route, options));
    }

    /**
     * Returns the value of a given key on a target object, with a default value.
     *
     * @method _getOption
     * @private
     * @memberof UniverseService
     * @param {Object} target The target object
     * @param {String} key The key to get value for
     * @param {*} defaultValue The default value if the key does not exist
     * @returns {*} The value of the key or default value
     */
    _getOption(target, key, defaultValue = null) {
        return target[key] !== undefined ? target[key] : defaultValue;
    }

    /**
     * Creates a new menu item with the provided information.
     *
     * @method _createMenuItem
     * @private
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     * @returns {Object} A new menu item object
     */
    _createMenuItem(title, route, options = {}) {
        const priority = this._getOption(options, 'priority', 9);
        const icon = this._getOption(options, 'icon', 'circle-dot');
        const items = this._getOption(options, 'items');
        const component = this._getOption(options, 'component');
        const componentParams = this._getOption(options, 'componentParams', {});
        const slug = this._getOption(options, 'slug', dasherize(title));
        const view = this._getOption(options, 'view');
        const queryParams = this._getOption(options, 'queryParams', {});
        const index = this._getOption(options, 'index', 0);
        const onClick = this._getOption(options, 'onClick', null);
        const section = this._getOption(options, 'section', null);

        // todo: create menu item class
        const menuItem = {
            title,
            route,
            icon,
            priority,
            items,
            component,
            componentParams,
            slug,
            queryParams,
            view,
            index,
            section,
        };

        // send default params into onClick
        if (typeof onClick === 'function') {
            menuItem.onClick = () => {
                return onClick(menuItem);
            };
        }

        return menuItem;
    }

    /**
     * Load the specified engine. If it is not loaded yet, it will use assetLoader
     * to load it and then register it to the router.
     *
     * @method loadEngine
     * @public
     * @memberof UniverseService
     * @param {String} name The name of the engine to load
     * @returns {Promise} A promise that resolves with the constructed engine instance
     */
    loadEngine(name) {
        const router = getOwner(this).lookup('router:main');
        const instanceId = 'manual'; // Arbitrary instance id, should be unique per engine
        const mountPoint = null; // No mount point for manually loaded engines

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
     * Construct an engine instance. If the instance does not exist yet, it will be created.
     *
     * @method constructEngineInstance
     * @public
     * @memberof UniverseService
     * @param {String} name The name of the engine
     * @param {String} instanceId The id of the engine instance
     * @param {String} mountPoint The mount point of the engine
     * @returns {Promise} A promise that resolves with the constructed engine instance
     */
    constructEngineInstance(name, instanceId, mountPoint) {
        const owner = getOwner(this);

        assert("You attempted to load the engine '" + name + "', but the engine cannot be found.", owner.hasRegistration(`engine:${name}`));

        let engineInstances = owner.lookup('router:main')._engineInstances;

        if (!engineInstances[name]) {
            engineInstances[name] = Object.create(null);
        }

        let engineInstance = owner.buildChildEngineInstance(name, {
            routable: true,
            mountPoint,
        });

        engineInstances[name][instanceId] = engineInstance;

        return engineInstance.boot().then(() => {
            return engineInstance;
        });
    }

    /**
     * Alias for intl service `t`
     *
     * @memberof UniverseService
     */
    t() {
        this.intl.t(...arguments);
    }
}

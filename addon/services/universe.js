import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { computed, action } from '@ember/object';
import { isBlank } from '@ember/utils';
import { isArray } from '@ember/array';
import { later } from '@ember/runloop';
import { dasherize, camelize } from '@ember/string';
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
     * @action
     * Creates a new registry with the given name and options.
    
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to create.
     * @param {Object} [options={}] - Optional settings for the registry.
     * @param {Array} [options.menuItems=[]] - An array of menu items for the registry.
     * @param {Array} [options.menuPanel=[]] - An array of menu panels for the registry.
     *
     * @fires registry.created - Event triggered when a new registry is created.
     *
     * @returns {UniverseService} Returns the current UniverseService for chaining.
     *
     * @example
     * createRegistry('myRegistry', { menuItems: ['item1', 'item2'], menuPanel: ['panel1', 'panel2'] });
     */
    @action createRegistry(registryName, options = {}) {
        const internalRegistryName = this.createInternalRegistryName(registryName);

        this[internalRegistryName] = {
            name: registryName,
            menuItems: [],
            menuPanels: [],
            ...options,
        };

        // trigger registry created event
        this.trigger('registry.created', this[internalRegistryName]);

        return this;
    }

    /**
     * Triggers an event on for a universe registry.
     *
     * @memberof UniverseService
     * @method createRegistryEvent
     * @param {string} registryName - The name of the registry to trigger the event on.
     * @param {string} event - The name of the event to trigger.
     * @param {...*} params - Additional parameters to pass to the event handler.
     */
    @action createRegistryEvent(registryName, event, ...params) {
        this.trigger(`${registryName}.${event}`, ...params);
    }

    /**
     * @action
     * Retrieves the entire registry with the given name.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to retrieve.
     *
     * @returns {Object|null} Returns the registry object if it exists; otherwise, returns null.
     *
     * @example
     * const myRegistry = getRegistry('myRegistry');
     */
    @action getRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        if (!isBlank(registry)) {
            return registry;
        }

        return null;
    }

    /**
     * Looks up a registry by its name and returns it as a Promise.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to look up.
     *
     * @returns {Promise<Object|null>} A Promise that resolves to the registry object if it exists; otherwise, rejects with null.
     *
     * @example
     * lookupRegistry('myRegistry')
     *   .then((registry) => {
     *     // Do something with the registry
     *   })
     *   .catch((error) => {
     *     // Handle the error or absence of the registry
     *   });
     */
    lookupRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        return new Promise((resolve, reject) => {
            if (!isBlank(registry)) {
                return resolve(registry);
            }

            later(
                this,
                () => {
                    if (!isBlank(registry)) {
                        return resolve(registry);
                    }
                },
                100
            );

            reject(null);
        });
    }

    /**
     * @action
     * Retrieves the menu items from a registry with the given name.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to retrieve menu items from.
     *
     * @returns {Array} Returns an array of menu items if the registry exists and has menu items; otherwise, returns an empty array.
     *
     * @example
     * const items = getMenuItemsFromRegistry('myRegistry');
     */
    @action getMenuItemsFromRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        if (!isBlank(registry) && isArray(registry.menuItems)) {
            return registry.menuItems;
        }

        return [];
    }

    /**
     * @action
     * Retrieves the menu panels from a registry with the given name.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to retrieve menu panels from.
     *
     * @returns {Array} Returns an array of menu panels if the registry exists and has menu panels; otherwise, returns an empty array.
     *
     * @example
     * const panels = getMenuPanelsFromRegistry('myRegistry');
     */
    @action getMenuPanelsFromRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        if (!isBlank(registry) && isArray(registry.menuPanels)) {
            return registry.menuPanels;
        }

        return [];
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
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        return new Promise((resolve) => {
            let component = null;

            if (isBlank(registry)) {
                return resolve(component);
            }

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
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        return new Promise((resolve) => {
            let foundMenuItem = null;

            if (isBlank(registry)) {
                return resolve(foundMenuItem);
            }

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
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const open = this._getOption(options, 'open', true);
        const slug = this._getOption(options, 'slug', dasherize(title));
        const menuPanel = {
            title,
            open,
            items: items.map(({ title, route, ...options }) => {
                options.slug = slug;
                options.view = dasherize(title);

                return this._createMenuItem(title, route, options);
            }),
        };

        // register menu panel
        this[internalRegistryName].menuPanels.pushObject(menuPanel);

        // trigger menu panel registered event
        this.trigger('menuPanel.registered', menuPanel, this[internalRegistryName]);
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
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const route = this._getOption(options, 'route', `console.${dasherize(registryName)}.virtual`);
        options.slug = this._getOption(options, 'slug', '~');
        options.view = this._getOption(options, 'view', dasherize(title));

        // not really a fan of assumptions, but will do this for the timebeing till anyone complains
        if (options.slug === options.view) {
            options.view = null;
        }

        // register component if applicable
        this.registerMenuItemComponentToEngine(options);

        // create menu item
        const menuItem = this._createMenuItem(title, route, options);

        // register menu item
        if (!this[internalRegistryName]) {
            this[internalRegistryName] = {
                menuItems: [],
                menuPanels: [],
            };
        }

        // register menu item
        this[internalRegistryName].menuItems.pushObject(menuItem);

        // trigger menu panel registered event
        this.trigger('menuItem.registered', menuItem, this[internalRegistryName]);
    }

    /**
     * Registers a menu item's component to one or multiple engines.
     *
     * @method registerMenuItemComponentToEngine
     * @public
     * @memberof UniverseService
     * @param {Object} options - An object containing the following properties:
     *   - `registerComponentToEngine`: A string or an array of strings representing the engine names where the component should be registered.
     *   - `component`: The component class to register, which should have a 'name' property.
     */
    registerMenuItemComponentToEngine(options) {
        // Register component if applicable
        if (typeof options.registerComponentToEngine === 'string') {
            this.registerComponentInEngine(options.registerComponentToEngine, options.component);
        }

        // register to multiple engines
        if (isArray(options.registerComponentToEngine)) {
            for (let i = 0; i < options.registerComponentInEngine.length; i++) {
                const engineName = options.registerComponentInEngine.objectAt(i);

                if (typeof engineName === 'string') {
                    this.registerComponentInEngine(engineName, options.component);
                }
            }
        }
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
        const renderComponentInPlace = this._getOption(options, 'renderComponentInPlace', false);
        const slug = this._getOption(options, 'slug', dasherize(title));
        const view = this._getOption(options, 'view');
        const queryParams = this._getOption(options, 'queryParams', {});
        const index = this._getOption(options, 'index', 0);
        const onClick = this._getOption(options, 'onClick', null);
        const section = this._getOption(options, 'section', null);

        // dasherize route segments
        if (typeof route === 'string') {
            route = route
                .split('.')
                .map((segment) => dasherize(segment))
                .join('.');
        }

        // todo: create menu item class
        const menuItem = {
            title,
            route,
            icon,
            priority,
            items,
            component,
            componentParams,
            renderComponentInPlace,
            slug,
            queryParams,
            view,
            index,
            section,
            onClick,
        };

        return menuItem;
    }

    /**
     * Creates an internal registry name by camelizing the provided registry name and appending "Registry" to it.
     *
     * @method createInternalRegistryName
     * @public
     * @memberof UniverseService
     * @param {String} registryName - The name of the registry to be camelized and formatted.
     * @returns {String} The formatted internal registry name.
     */
    createInternalRegistryName(registryName) {
        return `${camelize(registryName.replace(/[^a-zA-Z0-9]/g, '-'))}Registry`;
    }

    /**
     * Manually registers a component in a specified engine.
     *
     * @method registerComponentInEngine
     * @public
     * @memberof UniverseService
     * @param {String} engineName - The name of the engine where the component should be registered.
     * @param {Object} componentClass - The component class to register, which should have a 'name' property.
     */
    registerComponentInEngine(engineName, componentClass) {
        const engineInstance = this.getEngineInstance(engineName);
        if (engineInstance && !isBlank(componentClass) && typeof componentClass.name === 'string') {
            engineInstance.register(`component:${componentClass.name}`, componentClass);
        }
    }

    /**
     * Manually registers a service in a specified engine.
     *
     * @method registerComponentInEngine
     * @public
     * @memberof UniverseService
     * @param {String} engineName - The name of the engine where the component should be registered.
     * @param {Object} serviceClass - The service class to register, which should have a 'name' property.
     */
    registerServiceInEngine(targetEngineName, serviceName, currentEngineInstance) {
        // Get the target engine instance
        const targetEngineInstance = this.getEngineInstance(targetEngineName);

        // Validate inputs
        if (targetEngineInstance && currentEngineInstance && typeof serviceName === 'string') {
            // Lookup the service instance from the current engine
            const sharedService = currentEngineInstance.lookup(`service:${serviceName}`);

            if (sharedService) {
                // Register the service in the target engine
                targetEngineInstance.register(`service:${serviceName}`, sharedService, { instantiate: false });
            }
        }
    }

    /**
     * Retrieves a service instance from a specified Ember engine.
     *
     * @param {string} engineName - The name of the engine from which to retrieve the service.
     * @param {string} serviceName - The name of the service to retrieve.
     * @returns {Object|null} The service instance if found, otherwise null.
     *
     * @example
     * const userService = universe.getServiceFromEngine('user-engine', 'user');
     * if (userService) {
     *   userService.doSomething();
     * }
     */
    getServiceFromEngine(engineName, serviceName) {
        const engineInstance = this.getEngineInstance(engineName);

        if (engineInstance && typeof serviceName === 'string') {
            const serviceInstance = engineInstance.lookup(`service:${serviceName}`);
            return serviceInstance;
        }

        return null;
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
     * Retrieve an existing engine instance by its name and instanceId.
     *
     * @method getEngineInstance
     * @public
     * @memberof UniverseService
     * @param {String} name The name of the engine
     * @param {String} [instanceId='manual'] The id of the engine instance (defaults to 'manual')
     * @returns {Object|null} The engine instance if it exists, otherwise null
     */
    getEngineInstance(name, instanceId = 'manual') {
        const owner = getOwner(this);
        const router = owner.lookup('router:main');
        const engineInstances = router._engineInstances;

        if (engineInstances && engineInstances[name]) {
            return engineInstances[name][instanceId] || null;
        }

        return null;
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

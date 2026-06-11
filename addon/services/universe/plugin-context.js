import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { getOwner } from '@ember/application';
import { assert, warn } from '@ember/debug';
import { dasherize } from '@ember/string';
import hostServices from '../../exports/host-services';

function serviceNamesFromHostServices() {
    const serviceNames = new Set();

    for (const entry of hostServices) {
        if (typeof entry === 'string') {
            serviceNames.add(entry);
        } else if (entry && typeof entry === 'object') {
            Object.keys(entry).forEach((name) => serviceNames.add(dasherize(name)));
            Object.values(entry).forEach((name) => serviceNames.add(dasherize(name)));
        }
    }

    return serviceNames;
}

const ALLOWED_SERVICE_NAMES = serviceNamesFromHostServices();

function normalizeServiceName(name) {
    const normalized = name?.startsWith('service:') ? name.slice(8) : name;
    return typeof normalized === 'string' ? dasherize(normalized) : normalized;
}

function normalizeMenuItem(definition = {}) {
    const id = definition.id || definition.slug || dasherize(definition.title || definition.label || definition.text || 'plugin-menu-item');
    const title = definition.title || definition.label || definition.text || id;

    return {
        ...definition,
        id,
        slug: definition.slug || id,
        title,
        label: definition.label || title,
        text: definition.text || title,
        onClick: definition.onClick || definition.action || null,
        _plugin: definition._plugin,
    };
}

function normalizeWidget(definition = {}) {
    const id = definition.id || definition.widgetId || dasherize(definition.name || definition.title || 'plugin-widget');

    return {
        ...definition,
        id,
        widgetId: definition.widgetId || id,
        name: definition.name || definition.title || definition.label || id,
    };
}

/**
 * PluginContextService
 *
 * Builds constrained runtime contexts for lightweight Fleetbase plugins.
 * Plugins use this facade instead of directly reaching into Ember internals.
 */
export default class PluginContextService extends Service {
    @service universe;
    @service('universe/menu-service') menuService;
    @service('universe/widget-service') widgetService;
    @service('universe/hook-service') hookService;
    @service('universe/registry-service') registryService;

    @tracked applicationInstance = null;
    registeredPermissions = [];

    setApplicationInstance(application) {
        this.applicationInstance = application;
    }

    create(plugin = {}, appInstance = null, universe = this.universe) {
        const owner = appInstance || this.applicationInstance || getOwner(this);
        const pluginName = plugin.name || plugin.id || 'fleetbase-plugin';

        return {
            plugin,
            owner,
            lookup: (name) => this.lookup(name, owner),
            registerMenuItem: (slot, definition) => this.registerMenuItem(pluginName, slot, definition),
            registerWidget: (slot, definition) => this.registerWidget(pluginName, slot, definition),
            registerRoute: (path, definition) => this.registerRoute(pluginName, path, definition),
            registerAction: (slot, handler, options = {}) => this.registerAction(pluginName, slot, handler, options),
            registerHook: (name, handler, options = {}) => this.registerHook(pluginName, name, handler, options),
            registerPermission: (permission) => this.registerPermission(pluginName, permission),
            on: (event, callback) => this.onEvent(universe, event, callback),
            off: (event, callback) => this.offEvent(universe, event, callback),
            emit: (event, ...payload) => this.emitEvent(universe, event, ...payload),
        };
    }

    lookup(name, owner = null) {
        const serviceName = normalizeServiceName(name);

        assert(`[PluginContext] lookup() only supports service lookups, received '${name}'`, typeof serviceName === 'string' && serviceName.length > 0);
        assert(`[PluginContext] service '${serviceName}' is not available to plugins`, ALLOWED_SERVICE_NAMES.has(serviceName));

        const container = owner || this.applicationInstance || getOwner(this);
        return container?.lookup?.(`service:${serviceName}`) ?? null;
    }

    registerMenuItem(pluginName, slot, definition = {}) {
        assert('[PluginContext] registerMenuItem() requires a slot name', typeof slot === 'string' && slot.length > 0);

        const menuItem = normalizeMenuItem({
            ...definition,
            _plugin: pluginName,
        });

        this.menuService.registerMenuItem(slot, menuItem);
        return menuItem;
    }

    registerWidget(pluginName, slot, definition = {}) {
        assert('[PluginContext] registerWidget() requires a slot name', typeof slot === 'string' && slot.length > 0);

        const widget = normalizeWidget({
            ...definition,
            _plugin: pluginName,
        });

        this.registryService.register(slot, 'widget', widget.id, widget);

        if (slot === 'dashboard' || slot.startsWith('dashboard.')) {
            this.widgetService.registerWidgets(slot, widget);
        }

        return widget;
    }

    registerRoute(pluginName, path, definition = {}) {
        assert('[PluginContext] registerRoute() requires a path', typeof path === 'string' && path.length > 0);

        const route = {
            ...definition,
            path,
            id: definition.id || path,
            _plugin: pluginName,
        };

        this.registryService.register('plugin:routes', 'route', route.id, route);
        warn('[PluginContext] registerRoute() records virtual plugin routes only; runtime Ember route-map mutation is not supported in v1.', false, {
            id: 'ember-core.plugin-context.route-recorded',
        });

        return route;
    }

    registerAction(pluginName, slot, handler, options = {}) {
        assert('[PluginContext] registerAction() requires a slot name', typeof slot === 'string' && slot.length > 0);
        assert('[PluginContext] registerAction() requires a handler function', typeof handler === 'function');

        const action = {
            id: options.id || `${pluginName}:${slot}`,
            slot,
            handler,
            _plugin: pluginName,
            ...options,
        };

        this.registryService.register(slot, 'action', action.id, action);
        return action;
    }

    registerHook(pluginName, name, handler, options = {}) {
        const hookId = options.id || `${pluginName}:${name}`;

        this.hookService.registerHook(name, handler, {
            ...options,
            id: hookId,
        });

        return this.hookService.getHooks(name).find((hook) => hook.id === hookId);
    }

    registerPermission(pluginName, permission) {
        assert('[PluginContext] registerPermission() requires a permission string or definition', typeof permission === 'string' || (permission && typeof permission === 'object'));

        const definition = typeof permission === 'string' ? { permission } : permission;
        const registered = {
            ...definition,
            _plugin: pluginName,
        };

        this.registeredPermissions.push(registered);
        this.registryService.register('plugin:permissions', 'permission', registered.permission || registered.id, registered);
        return registered;
    }

    onEvent(universe, event, callback) {
        universe?.on?.(event, callback);
        return callback;
    }

    offEvent(universe, event, callback) {
        universe?.off?.(event, callback);
    }

    emitEvent(universe, event, ...payload) {
        universe?.trigger?.(event, ...payload);
    }
}

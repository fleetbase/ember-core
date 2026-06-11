import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

module('Unit | Service | universe/plugin-context', function (hooks) {
    setupTest(hooks);

    test('lookup allows approved host services', function (assert) {
        const contextService = this.owner.lookup('service:universe/plugin-context');
        const context = contextService.create({ name: '@fleetbase/test-plugin' }, this.owner);

        assert.strictEqual(context.lookup('service:fetch'), this.owner.lookup('service:fetch'));
    });

    test('lookup rejects services outside the plugin allowlist', function (assert) {
        const contextService = this.owner.lookup('service:universe/plugin-context');
        const context = contextService.create({ name: '@fleetbase/test-plugin' }, this.owner);

        assert.throws(() => context.lookup('service:plugin-private'), /not available to plugins/);
    });

    test('registerMenuItem stores a normalized menu item in the requested slot', function (assert) {
        const contextService = this.owner.lookup('service:universe/plugin-context');
        const registry = this.owner.lookup('service:universe/registry-service');
        const context = contextService.create({ name: '@fleetbase/test-plugin' }, this.owner);
        const handler = () => {};

        const menuItem = context.registerMenuItem('fleet-ops.order.actions', {
            id: 'send-to-partner',
            label: 'Send to Partner',
            icon: 'paper-plane',
            action: handler,
        });

        const registered = registry.lookup('fleet-ops.order.actions', 'menu-item', 'send-to-partner');

        assert.strictEqual(menuItem.title, 'Send to Partner');
        assert.strictEqual(registered.onClick, handler);
        assert.strictEqual(registered._plugin, '@fleetbase/test-plugin');
    });

    test('registerWidget stores widgets by slot and dashboard registry', function (assert) {
        const contextService = this.owner.lookup('service:universe/plugin-context');
        const registry = this.owner.lookup('service:universe/registry-service');
        const widgetService = this.owner.lookup('service:universe/widget-service');
        const context = contextService.create({ name: '@fleetbase/test-plugin' }, this.owner);

        context.registerWidget('dashboard.summary', {
            id: 'partner-status',
            title: 'Partner Status',
            component: () => Promise.resolve({ default: null }),
        });

        assert.strictEqual(registry.lookup('dashboard.summary', 'widget', 'partner-status').name, 'Partner Status');
        assert.strictEqual(widgetService.getWidget('dashboard.summary', 'partner-status').name, 'Partner Status');
    });

    test('registerAction, registerHook, permissions, and events delegate to universe services', function (assert) {
        assert.expect(7);

        const contextService = this.owner.lookup('service:universe/plugin-context');
        const registry = this.owner.lookup('service:universe/registry-service');
        const hookService = this.owner.lookup('service:universe/hook-service');
        const universe = this.owner.lookup('service:universe');
        const context = contextService.create({ name: '@fleetbase/test-plugin' }, this.owner, universe);
        const actionHandler = () => {};
        const hookHandler = () => {};
        const eventHandler = (payload) => {
            assert.strictEqual(payload.status, 'ok');
        };

        context.registerAction('fleet-ops.order.actions', actionHandler, { id: 'sync-partner' });
        context.registerHook('order.sent', hookHandler);
        context.registerPermission('partner.send-order');
        context.on('partner.ready', eventHandler);
        context.emit('partner.ready', { status: 'ok' });
        context.off('partner.ready', eventHandler);

        assert.strictEqual(registry.lookup('fleet-ops.order.actions', 'action', 'sync-partner').handler, actionHandler);
        assert.strictEqual(hookService.getHooks('order.sent')[0].handler, hookHandler);
        assert.strictEqual(registry.lookup('plugin:permissions', 'permission', 'partner.send-order').permission, 'partner.send-order');
        assert.strictEqual(contextService.registeredPermissions[0].permission, 'partner.send-order');
        assert.strictEqual(registry.lookup('fleet-ops.order.actions', 'action', 'sync-partner')._plugin, '@fleetbase/test-plugin');
        assert.strictEqual(hookService.getHooks('order.sent')[0].id, '@fleetbase/test-plugin:order.sent');
    });
});

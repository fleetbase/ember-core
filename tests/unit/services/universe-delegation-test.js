import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * UniverseService is a facade: most of its surface forwards to one of five
 * sub-services. The wiring *is* the contract for those methods — which
 * sub-service, which method, and with which arguments — and it is exactly what
 * breaks silently in a refactor, so it is asserted directly.
 *
 * That turned out to matter: several of these forward the wrong number of
 * arguments, which the tests below pin.
 */
function recordingService(calls, name) {
    return class extends Service {
        constructor() {
            super(...arguments);
            return new Proxy(this, {
                get(target, prop) {
                    if (prop in target) {
                        return target[prop];
                    }
                    if (typeof prop !== 'string') {
                        return undefined;
                    }
                    return (...args) => {
                        calls.push({ service: name, method: prop, args });
                        return `result:${name}.${prop}`;
                    };
                },
            });
        }
    };
}

module('Unit | Service | universe (delegation)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.calls = [];

        for (const [key, name] of [
            ['universe/registry-service', 'registry'],
            ['universe/menu-service', 'menu'],
            ['universe/widget-service', 'widget'],
            ['universe/hook-service', 'hook'],
            ['universe/extension-manager', 'extension'],
        ]) {
            this.owner.register(`service:${key}`, recordingService(this.calls, name));
        }

        for (const name of ['router', 'intl', 'url-search-params']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:universe');
        this.lastCall = () => this.calls.at(-1);
    });

    module('menus', function () {
        test('menu registration forwards to the menu service', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', { icon: 'box' });

            assert.deepEqual(this.lastCall(), {
                service: 'menu',
                method: 'registerHeaderMenuItem',
                args: ['Orders', 'console.orders', { icon: 'box' }],
            });
        });

        test('the account and settings registrations forward too', function (assert) {
            this.service.registerOrganizationMenuItem('Billing', { section: 'finance' });
            assert.deepEqual(this.lastCall().method, 'registerOrganizationMenuItem');

            this.service.registerUserMenuItem('Profile');
            assert.deepEqual(this.lastCall().method, 'registerUserMenuItem');

            this.service.registerSettingsMenuItem('Notifications');
            assert.deepEqual(this.lastCall().method, 'registerSettingsMenuItem');
        });

        test('admin panel registration passes items and options through', function (assert) {
            this.service.registerAdminMenuPanel('Fleet Ops', [{ title: 'Navigator' }], { priority: 3 });

            assert.deepEqual(this.lastCall(), {
                service: 'menu',
                method: 'registerAdminMenuPanel',
                args: ['Fleet Ops', [{ title: 'Navigator' }], { priority: 3 }],
            });
        });

        test('the generic registration passes all four arguments', function (assert) {
            this.service.registerMenuItem('engine:fleet-ops', 'Orders', { route: 'r' }, { icon: 'box' });

            assert.deepEqual(this.lastCall().args, ['engine:fleet-ops', 'Orders', { route: 'r' }, { icon: 'box' }]);
        });

        test('the menu getters read through', function (assert) {
            assert.strictEqual(this.service.headerMenuItems, 'result:menu.getHeaderMenuItems');
            assert.strictEqual(this.service.organizationMenuItems, 'result:menu.getOrganizationMenuItems');
            assert.strictEqual(this.service.userMenuItems, 'result:menu.getUserMenuItems');
            assert.strictEqual(this.service.adminMenuItems, 'result:menu.getAdminMenuItems');
            assert.strictEqual(this.service.adminMenuPanels, 'result:menu.getAdminMenuPanels');
        });
    });

    module('widgets and dashboards', function () {
        test('dashboard registration forwards to the widget service', function (assert) {
            this.service.registerDashboard('sales', { title: 'Sales' });
            assert.deepEqual(this.lastCall(), { service: 'widget', method: 'registerDashboard', args: ['sales', { title: 'Sales' }] });

            this.service.registerDashboardSlot('console.home', { label: 'Home' });
            assert.strictEqual(this.lastCall().method, 'registerDashboardSlot');

            this.service.registerDashboardForSlot('console.home', 'sales', { priority: 2 });
            assert.deepEqual(this.lastCall().args, ['console.home', 'sales', { priority: 2 }]);
        });

        test('the default dashboard setters forward', function (assert) {
            this.service.setDefaultDashboardForSlot('console.home', 'sales');
            assert.deepEqual(this.lastCall().args, ['console.home', 'sales']);

            this.service.setConsoleDashboard('sales');
            assert.deepEqual(this.lastCall(), { service: 'widget', method: 'setConsoleDashboard', args: ['sales'] });
        });

        test('the deprecated widget registrations still forward', function (assert) {
            this.service.registerDashboardWidgets([{ id: 'a' }]);
            assert.strictEqual(this.lastCall().method, 'registerDashboardWidgets');

            this.service.registerDefaultDashboardWidgets([{ id: 'a' }]);
            assert.strictEqual(this.lastCall().method, 'registerDefaultDashboardWidgets');
        });

        test('the dashboardWidgets getter reads the default dashboard', function (assert) {
            // 'dashboard' is where the deprecated registerDashboardWidgets() and
            // registerDefaultDashboardWidgets() register.
            const widgets = this.service.dashboardWidgets;

            assert.deepEqual(
                this.calls.map((c) => ({ method: c.method, args: c.args })),
                [
                    { method: 'getDefaultWidgets', args: ['dashboard'] },
                    { method: 'getWidgets', args: ['dashboard'] },
                ]
            );
            assert.ok(widgets, 'the shape is still returned');
        });
    });

    module('hooks', function () {
        test('hook registration forwards', function (assert) {
            const handler = () => {};

            this.service.registerHook('order:before-save', handler, { priority: 3 });

            assert.deepEqual(this.lastCall(), {
                service: 'hook',
                method: 'registerHook',
                args: ['order:before-save', handler, { priority: 3 }],
            });
        });

        test('executeHook forwards to execute with its arguments', async function (assert) {
            await this.service.executeHook('order:before-save', 'a', 2);

            assert.deepEqual(this.lastCall(), { service: 'hook', method: 'execute', args: ['order:before-save', 'a', 2] });
        });
    });

    module('extensions', function () {
        test('engine access forwards to the extension manager', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            assert.deepEqual(this.lastCall(), { service: 'extension', method: 'ensureEngineLoaded', args: ['@fleetbase/fleetops-engine'] });

            this.service.getEngineInstance('@fleetbase/fleetops-engine');
            assert.strictEqual(this.lastCall().method, 'getEngineInstance');
        });

        test('extension registration forwards with its metadata', function (assert) {
            this.service.registerExtension('fleet-ops', { version: '1.0.0' });

            assert.deepEqual(this.lastCall().args, ['fleet-ops', { version: '1.0.0' }]);
        });

        test('afterBoot forwards', function (assert) {
            const callback = () => {};

            this.service.afterBoot(callback);

            assert.deepEqual(this.lastCall(), { service: 'extension', method: 'afterBoot', args: [callback] });
        });
    });

    module('container registration', function () {
        test('components and services forward to the registry service', function (assert) {
            class Thing {}

            this.service.registerComponent('my-thing', Thing, { singleton: true });
            assert.deepEqual(this.lastCall(), { service: 'registry', method: 'registerComponent', args: ['my-thing', Thing, { singleton: true }] });

            this.service.registerService('my-thing', Thing);
            assert.deepEqual(this.lastCall().args, ['my-thing', Thing, {}]);
        });

        test('renderable components forward', function (assert) {
            const component = { name: 'order-details' };

            this.service.registerRenderableComponent('slot', component, { engineName: 'fleet-ops' });
            assert.deepEqual(this.lastCall().args, ['slot', component, { engineName: 'fleet-ops' }]);

            this.service.getRenderableComponentsFromRegistry('slot');
            assert.deepEqual(this.lastCall(), { service: 'registry', method: 'getRenderableComponents', args: ['slot'] });
        });
    });

    module('the generic registry API', function () {
        test('registerInRegistry forwards the value into the menu-item list by default', function (assert) {
            this.service.registerInRegistry('my-registry', 'my-key', { some: 'value' });

            assert.deepEqual(this.lastCall(), {
                service: 'registry',
                method: 'register',
                args: ['my-registry', 'menu-item', 'my-key', { some: 'value' }],
            });

            this.service.registerInRegistry('my-registry', 'my-key', { some: 'value' }, 'widgets');
            assert.deepEqual(this.lastCall().args, ['my-registry', 'widgets', 'my-key', { some: 'value' }], 'or the list named');
        });

        test('getRegistry names a list', function (assert) {
            this.service.getRegistry('my-registry');
            assert.deepEqual(this.lastCall().args, ['my-registry', 'menu-item']);

            this.service.getRegistry('my-registry', 'widgets');
            assert.deepEqual(this.lastCall().args, ['my-registry', 'widgets']);
        });

        test('lookupFromRegistry passes the list before the key', function (assert) {
            this.service.lookupFromRegistry('my-registry', 'my-key');
            assert.deepEqual(this.lastCall().args, ['my-registry', 'menu-item', 'my-key']);

            this.service.lookupFromRegistry('my-registry', 'my-key', 'widgets');
            assert.deepEqual(this.lastCall().args, ['my-registry', 'widgets', 'my-key']);
        });

        test('the menu-registry readers ask the menu service', function (assert) {
            this.service.getMenuItemsFromRegistry('engine:fleet-ops');
            assert.deepEqual(this.lastCall(), { service: 'menu', method: 'getMenuItems', args: ['engine:fleet-ops'] });

            this.service.getMenuPanelsFromRegistry('engine:fleet-ops');
            assert.deepEqual(this.lastCall(), { service: 'menu', method: 'getMenuPanels', args: ['engine:fleet-ops'] });
        });

        test('createRegistry and createRegistries forward as-is', function (assert) {
            this.service.createRegistry('my-registry');
            assert.deepEqual(this.lastCall(), { service: 'registry', method: 'createRegistry', args: ['my-registry'] });

            this.service.createRegistries(['a', 'b']);
            assert.deepEqual(this.lastCall().args, [['a', 'b']]);
        });
    });
});

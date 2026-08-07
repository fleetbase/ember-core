import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Widget from '@fleetbase/ember-core/contracts/widget';

class RegistryStubService extends Service {
    registries = new Map();

    register(section, list, key, value) {
        const registryKey = `${section}:${list}`;
        const registry = this.registries.get(registryKey) ?? [];
        const record = { ...value, _registryKey: key };
        const existingIndex = registry.findIndex((item) => item._registryKey === key);

        if (existingIndex === -1) {
            registry.push(record);
        } else {
            registry[existingIndex] = record;
        }

        this.registries.set(registryKey, registry);
    }

    getRegistry(section, list) {
        return this.registries.get(`${section}:${list}`) ?? [];
    }

    lookup(section, list, key) {
        return this.getRegistry(section, list).find((item) => item._registryKey === key) ?? null;
    }
}

module('Unit | Service | universe/widget-service', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe/registry-service', RegistryStubService);
        this.service = this.owner.lookup('service:universe/widget-service');
    });

    test('it registers multiple system dashboards for a dashboard slot', function (assert) {
        const service = this.owner.lookup('service:universe/widget-service');

        service.registerDashboardForSlot('console.home', 'dashboard', {
            name: 'Default Dashboard',
            priority: 0,
        });
        service.registerDashboardForSlot('console.home', 'alrashd', {
            name: 'Al-Rashed KPI Dashboard',
            priority: 10,
        });
        service.setConsoleDashboard('alrashd');

        const dashboards = service.getDashboardsForSlot('console.home');

        assert.deepEqual(
            dashboards.map((dashboard) => dashboard.id),
            ['alrashd', 'dashboard'],
            'slot dashboards are returned by priority'
        );
        assert.strictEqual(service.getDefaultDashboardForSlot('console.home'), 'alrashd', 'console shortcut sets the console home default');
        assert.strictEqual(service.getDashboard('alrashd').name, 'Al-Rashed KPI Dashboard', 'dashboard namespace metadata is registered');
    });

    module('dashboards', function () {
        test('a dashboard is registered under its name', function (assert) {
            this.service.registerDashboard('sales', { title: 'Sales' });

            assert.strictEqual(this.service.getDashboard('sales').name, 'sales');
            assert.strictEqual(this.service.getDashboard('sales').title, 'Sales');
        });

        test('getDashboards lists every registered dashboard', function (assert) {
            this.service.registerDashboard('sales');
            this.service.registerDashboard('ops');

            assert.deepEqual(
                this.service.getDashboards().map((d) => d.name),
                ['sales', 'ops']
            );
        });

        test('an unknown dashboard is null', function (assert) {
            assert.strictEqual(this.service.getDashboard('nope'), null);
        });

        test('re-registering a dashboard replaces it', function (assert) {
            this.service.registerDashboard('sales', { title: 'First' });
            this.service.registerDashboard('sales', { title: 'Second' });

            assert.strictEqual(this.service.getDashboards().length, 1);
            assert.strictEqual(this.service.getDashboard('sales').title, 'Second');
        });
    });

    module('slots', function () {
        test('registering a dashboard for a slot also registers the slot and the dashboard', function (assert) {
            this.service.registerDashboardForSlot('console.home', 'sales');

            assert.strictEqual(this.service.getDashboard('sales').name, 'sales', 'the widget namespace is registered');
            const slots = this.owner.lookup('service:universe/registry-service').getRegistry('dashboard:slots', 'slot');
            assert.deepEqual(
                slots.map((slot) => slot.id),
                ['console.home'],
                'the slot is registered'
            );
        });

        test('slot dashboards carry defaults for name, extension and priority', function (assert) {
            this.service.registerDashboardForSlot('console.home', 'sales');

            const [dashboard] = this.service.getDashboardsForSlot('console.home');
            assert.strictEqual(dashboard.name, 'sales', 'the namespace stands in for a missing name');
            assert.strictEqual(dashboard.extension, 'core');
            assert.strictEqual(dashboard.priority, 0);
            assert.strictEqual(dashboard.slotId, 'console.home');
            assert.strictEqual(dashboard.dashboardId, 'sales');
        });

        test('defaultDashboardName is accepted as a name', function (assert) {
            this.service.registerDashboardForSlot('console.home', 'sales', { defaultDashboardName: 'Sales overview' });

            assert.strictEqual(this.service.getDashboardsForSlot('console.home')[0].name, 'Sales overview');
        });

        test('dashboards are scoped to their slot', function (assert) {
            this.service.registerDashboardForSlot('console.home', 'sales');
            this.service.registerDashboardForSlot('console.reports', 'ops');

            assert.deepEqual(
                this.service.getDashboardsForSlot('console.home').map((d) => d.id),
                ['sales']
            );
            assert.deepEqual(
                this.service.getDashboardsForSlot('console.reports').map((d) => d.id),
                ['ops']
            );
        });

        test('a slot prefix does not leak into a longer slot name', function (assert) {
            this.service.registerDashboardForSlot('console.home', 'sales');
            this.service.registerDashboardForSlot('console.home.extra', 'ops');

            assert.deepEqual(
                this.service.getDashboardsForSlot('console.home').map((d) => d.id),
                ['sales'],
                'the separator keeps the prefixes distinct'
            );
        });

        test('higher priority sorts first', function (assert) {
            this.service.registerDashboardForSlot('slot', 'low', { priority: 1 });
            this.service.registerDashboardForSlot('slot', 'high', { priority: 99 });
            this.service.registerDashboardForSlot('slot', 'none');

            assert.deepEqual(
                this.service.getDashboardsForSlot('slot').map((d) => d.id),
                ['high', 'low', 'none']
            );
        });

        test('an empty or unknown slot yields no dashboards', function (assert) {
            assert.deepEqual(this.service.getDashboardsForSlot(), []);
            assert.deepEqual(this.service.getDashboardsForSlot(''), []);
            assert.deepEqual(this.service.getDashboardsForSlot('never-registered'), []);
        });

        test('the default dashboard for a slot can be set and read back', function (assert) {
            this.service.setDefaultDashboardForSlot('console.reports', 'ops');

            assert.strictEqual(this.service.getDefaultDashboardForSlot('console.reports'), 'ops');
        });

        test('setting the default again replaces it', function (assert) {
            this.service.setDefaultDashboardForSlot('slot', 'first');
            this.service.setDefaultDashboardForSlot('slot', 'second');

            assert.strictEqual(this.service.getDefaultDashboardForSlot('slot'), 'second');
        });

        test('a slot with no default reads null', function (assert) {
            assert.strictEqual(this.service.getDefaultDashboardForSlot('slot'), null);
        });

        test('setConsoleDashboard targets console.home', function (assert) {
            this.service.setConsoleDashboard('ops');

            assert.strictEqual(this.service.getDefaultDashboardForSlot('console.home'), 'ops');
        });
    });

    module('widgets', function () {
        test('a widget is registered against its dashboard', function (assert) {
            this.service.registerWidgets('sales', [{ id: 'revenue', name: 'Revenue' }]);

            assert.deepEqual(
                this.service.getWidgets('sales').map((w) => w.id),
                ['revenue']
            );
            assert.strictEqual(this.service.getWidget('sales', 'revenue').name, 'Revenue');
        });

        test('a single widget need not be wrapped in an array', function (assert) {
            this.service.registerWidgets('sales', { id: 'revenue' });

            assert.strictEqual(this.service.getWidgets('sales').length, 1);
        });

        test('a Widget contract instance is normalized', function (assert) {
            this.service.registerWidgets('sales', new Widget({ id: 'revenue', name: 'Revenue', component: 'widgets/revenue' }));

            const widget = this.service.getWidget('sales', 'revenue');
            assert.strictEqual(widget.name, 'Revenue');
            assert.strictEqual(widget.component, 'widgets/revenue');
        });

        test('widgetId is accepted in place of id', function (assert) {
            this.service.registerWidgets('sales', { widgetId: 'revenue', name: 'Revenue' });

            assert.strictEqual(this.service.getWidget('sales', 'revenue').name, 'Revenue', 'the legacy key is mapped onto id');
        });

        test('widgets are scoped to their dashboard', function (assert) {
            this.service.registerWidgets('sales', { id: 'revenue' });
            this.service.registerWidgets('ops', { id: 'uptime' });

            assert.deepEqual(
                this.service.getWidgets('sales').map((w) => w.id),
                ['revenue']
            );
            assert.deepEqual(
                this.service.getWidgets('ops').map((w) => w.id),
                ['uptime']
            );
        });

        test('an unknown or missing dashboard yields no widgets', function (assert) {
            assert.deepEqual(this.service.getWidgets(), []);
            assert.deepEqual(this.service.getWidgets('never-registered'), []);
        });

        test('an unknown widget is null', function (assert) {
            assert.strictEqual(this.service.getWidget('sales', 'nope'), null);
        });

        test('getRegistry is getWidgets under another name', function (assert) {
            this.service.registerWidgets('sales', { id: 'revenue' });

            assert.deepEqual(this.service.getRegistry('sales'), this.service.getWidgets('sales'));
        });
    });

    module('default widgets', function () {
        test('a widget marked default is registered in both lists', function (assert) {
            this.service.registerWidgets('sales', { id: 'revenue', default: true });

            assert.deepEqual(
                this.service.getWidgets('sales').map((w) => w.id),
                ['revenue'],
                'still selectable'
            );
            assert.deepEqual(
                this.service.getDefaultWidgets('sales').map((w) => w.id),
                ['revenue'],
                'and auto-loaded'
            );
        });

        test('default must be exactly true', function (assert) {
            this.service.registerWidgets('sales', { id: 'revenue', default: 'yes' });

            assert.deepEqual(this.service.getDefaultWidgets('sales'), []);
        });

        test('registerDefaultWidgets adds only to the default list', function (assert) {
            this.service.registerDefaultWidgets('sales', [{ id: 'revenue' }]);

            assert.deepEqual(
                this.service.getDefaultWidgets('sales').map((w) => w.id),
                ['revenue']
            );
            assert.deepEqual(this.service.getWidgets('sales'), [], 'it is not also made selectable');
        });

        test('a single default widget need not be wrapped in an array', function (assert) {
            this.service.registerDefaultWidgets('sales', { id: 'revenue' });

            assert.strictEqual(this.service.getDefaultWidgets('sales').length, 1);
        });

        test('default widgets are scoped to their dashboard', function (assert) {
            this.service.registerDefaultWidgets('sales', { id: 'revenue' });

            assert.deepEqual(this.service.getDefaultWidgets('ops'), []);
        });

        test('an unknown or missing dashboard yields no default widgets', function (assert) {
            assert.deepEqual(this.service.getDefaultWidgets(), []);
            assert.deepEqual(this.service.getDefaultWidgets('never-registered'), []);
        });
    });

    module('deprecated entry points', function () {
        test('registerDashboardWidgets targets the dashboard namespace', function (assert) {
            this.service.registerDashboardWidgets([{ id: 'revenue' }]);

            assert.deepEqual(
                this.service.getWidgets('dashboard').map((w) => w.id),
                ['revenue']
            );
        });

        test('registerDefaultDashboardWidgets targets the dashboard namespace', function (assert) {
            this.service.registerDefaultDashboardWidgets([{ id: 'revenue' }]);

            assert.deepEqual(
                this.service.getDefaultWidgets('dashboard').map((w) => w.id),
                ['revenue']
            );
        });
    });

    test('setApplicationInstance records the application', function (assert) {
        const application = {};

        this.service.setApplicationInstance(application);

        assert.strictEqual(this.service.applicationInstance, application);
    });
});

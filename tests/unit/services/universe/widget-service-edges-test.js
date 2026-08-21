import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * What the widget service does with input it does not recognise: a definition
 * with no id, something that is not an object at all, and a registry that has
 * picked up a non-object entry.
 */
class RegistryStubService extends Service {
    registries = new Map();

    register(section, list, key, value) {
        const registryKey = `${section}:${list}`;
        const registry = this.registries.get(registryKey) ?? [];
        registry.push(Object.assign(value, { _registryKey: key }));
        this.registries.set(registryKey, registry);
    }

    getRegistry(section, list) {
        return this.registries.get(`${section}:${list}`) ?? [];
    }

    setRegistry(section, list, value) {
        this.registries.set(`${section}:${list}`, value);
    }
}

module('Unit | Service | universe/widget-service (edges)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe/registry-service', RegistryStubService);
        this.owner.register('service:universe', class extends Service {});

        this.service = this.owner.lookup('service:universe/widget-service');
        this.registry = this.owner.lookup('service:universe/registry-service');
    });

    module('normalizing a definition', function () {
        test('widgetId is accepted as an alias for id', function (assert) {
            this.service.registerDashboardWidgets([{ widgetId: 'orders-summary', name: 'Orders' }]);

            const [widget] = this.registry.getRegistry('dashboard:widgets', 'widget');
            assert.strictEqual(widget.id, 'orders-summary');
        });

        test('a definition with no id at all is still registered, with an undefined id', function (assert) {
            this.service.registerDashboardWidgets([{ name: 'Nameless' }]);

            const [widget] = this.registry.getRegistry('dashboard:widgets', 'widget');
            assert.strictEqual(widget.id, undefined, 'it warns rather than rejecting the definition');
            assert.strictEqual(widget.name, 'Nameless');
        });

        test('something that is not an object is passed straight through', function (assert) {
            this.service.registerDashboardWidgets(['just-a-string']);

            assert.deepEqual(this.registry.getRegistry('dashboard:widgets', 'widget')[0], 'just-a-string');
        });
    });

    module('reading a registry that holds junk', function (hooks) {
        hooks.beforeEach(function () {
            this.registry.setRegistry('dashboard:widgets', 'widget', [null, 'a string', 42, { _registryKey: 'console#orders', id: 'orders' }]);
            this.registry.setRegistry('dashboard:widgets', 'default-widget', [null, 'a string', { _registryKey: 'console#summary', id: 'summary' }]);
        });

        test('getWidgets skips every non-object entry', function (assert) {
            const widgets = this.service.getWidgets('console');

            assert.deepEqual(
                widgets.map((widget) => widget.id),
                ['orders']
            );
        });

        test('getDefaultWidgets skips them too', function (assert) {
            const widgets = this.service.getDefaultWidgets('console');

            assert.deepEqual(
                widgets.map((widget) => widget.id),
                ['summary']
            );
        });

        test('a dashboard with no matching prefix gets nothing', function (assert) {
            assert.deepEqual(this.service.getWidgets('other-dashboard'), []);
        });

        test('no dashboard name at all gets nothing', function (assert) {
            assert.deepEqual(this.service.getWidgets(), []);
            assert.deepEqual(this.service.getDefaultWidgets(), []);
        });
    });

    module('ordering slot dashboards', function () {
        test('dashboards with no priority sort as zero rather than dropping out', function (assert) {
            this.service.registerDashboardForSlot('console.home', 'first', { name: 'First' });
            this.service.registerDashboardForSlot('console.home', 'second', { name: 'Second' });
            this.service.registerDashboardForSlot('console.home', 'top', { name: 'Top', priority: 5 });

            const dashboards = this.service.getDashboardsForSlot('console.home');

            assert.strictEqual(dashboards[0].id, 'top', 'a declared priority still wins');
            assert.strictEqual(dashboards.length, 3, 'and the unprioritised two are kept');
        });
    });
});

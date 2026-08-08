import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * lookupMenuItemFromRegistry's matching rules.
 *
 * The facade's own getMenuItemsFromRegistry goes to the REGISTRY service, not
 * the menu service, and passes too few arguments to it — that is already on the
 * defect register — so against a real registry the list is always empty and the
 * matcher never runs. The stub here returns items regardless of the arguments,
 * which is what lets the matching itself be exercised at all.
 */
module('Unit | Service | universe (registry lookup)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.items = [];
        const testContext = this;

        this.owner.register(
            'service:universe/registry-service',
            class extends Service {
                getRegistry() {
                    return testContext.items;
                }
            }
        );

        for (const name of ['universe/menu-service', 'universe/extension-manager', 'universe/widget-service', 'universe/hook-service', 'router', 'intl', 'url-search-params']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:universe');
    });

    test('it finds an item by slug', function (assert) {
        this.items = [
            { slug: 'orders', title: 'Orders' },
            { slug: 'drivers', title: 'Drivers' },
        ];

        assert.strictEqual(this.service.lookupMenuItemFromRegistry('engine:fleet-ops', 'drivers').title, 'Drivers');
    });

    test('a slug that is not there yields undefined', function (assert) {
        this.items = [{ slug: 'orders' }];

        assert.strictEqual(this.service.lookupMenuItemFromRegistry('engine:fleet-ops', 'missing'), undefined);
    });

    test('a view narrows the match', function (assert) {
        this.items = [
            { slug: 'orders', view: 'list' },
            { slug: 'orders', view: 'map' },
        ];

        assert.strictEqual(this.service.lookupMenuItemFromRegistry('engine:fleet-ops', 'orders', 'map').view, 'map');
    });

    test('no view matches the first item with that slug, whatever its view', function (assert) {
        this.items = [
            { slug: 'orders', view: 'list' },
            { slug: 'orders', view: 'map' },
        ];

        assert.strictEqual(this.service.lookupMenuItemFromRegistry('engine:fleet-ops', 'orders').view, 'list');
    });

    test('a section narrows the match too', function (assert) {
        this.items = [
            { slug: 'orders', section: 'ops' },
            { slug: 'orders', section: 'admin' },
        ];

        assert.strictEqual(this.service.lookupMenuItemFromRegistry('engine:fleet-ops', 'orders', null, 'admin').section, 'admin');
    });

    test('view and section must both match when both are given', function (assert) {
        this.items = [
            { slug: 'orders', view: 'map', section: 'ops' },
            { slug: 'orders', view: 'map', section: 'admin' },
        ];

        assert.strictEqual(this.service.lookupMenuItemFromRegistry('engine:fleet-ops', 'orders', 'map', 'admin').section, 'admin');
        assert.strictEqual(this.service.lookupMenuItemFromRegistry('engine:fleet-ops', 'orders', 'list', 'admin'), undefined);
    });

    test('_createMenuItem applies a component option', function (assert) {
        const item = this.service._createMenuItem('Orders', 'console.orders', { component: 'order-list' });

        assert.strictEqual(item.component, 'order-list');
    });
});

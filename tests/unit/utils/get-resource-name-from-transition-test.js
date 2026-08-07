import getResourceNameFromTransition from 'dummy/utils/get-resource-name-from-transition';
import { module, test } from 'qunit';

/**
 * The resource name is read out of a route path by position: the fourth
 * segment. That assumes the console's `console.<engine>.<section>.<resource>`
 * shape, and the tests below pin what happens when a route does not have it.
 */
function transition(name) {
    return { to: { name } };
}

module('Unit | Utility | get-resource-name-from-transition', function () {
    test('it takes the fourth segment of the route name', function (assert) {
        assert.strictEqual(getResourceNameFromTransition(transition('console.fleet-ops.operations.orders.index')), 'orders');
    });

    test('a route ending at the resource still resolves', function (assert) {
        assert.strictEqual(getResourceNameFromTransition(transition('console.fleet-ops.operations.orders')), 'orders');
    });

    test('humanize makes the segment readable', function (assert) {
        assert.strictEqual(getResourceNameFromTransition(transition('console.fleet-ops.operations.fuel_reports.index'), { humanize: true }), 'Fuel reports');
    });

    test('humanize restores an acronym', function (assert) {
        assert.strictEqual(getResourceNameFromTransition(transition('console.fleet-ops.operations.api_keys.index'), { humanize: true }), 'API keys');
    });

    test('any option other than an exact true is ignored', function (assert) {
        assert.strictEqual(getResourceNameFromTransition(transition('console.fleet-ops.operations.fuel_reports.index'), { humanize: 'yes' }), 'fuel_reports');
    });

    test('a route with too few segments yields undefined', function (assert) {
        // The fourth segment is taken by position, so a shallower route has no
        // resource name to give.
        assert.strictEqual(getResourceNameFromTransition(transition('console.fleet-ops.operations')), undefined);
    });

    test('a transition with a non-string route name yields null', function (assert) {
        assert.strictEqual(getResourceNameFromTransition(transition(undefined)), null);
        assert.strictEqual(getResourceNameFromTransition(transition(null)), null);
    });
});

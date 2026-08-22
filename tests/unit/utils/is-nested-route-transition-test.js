import isNestedRouteTransition from 'dummy/utils/is-nested-route-transition';
import { module, test } from 'qunit';

function transition({ toName, fromParent, toParent }) {
    return {
        to: { name: toName, parent: toParent === undefined ? undefined : { name: toParent } },
        from: { parent: fromParent === undefined ? undefined : { name: fromParent } },
    };
}

module('Unit | Utility | is-nested-route-transition', function () {
    test('it detects a transition into a child of the current parent route', function (assert) {
        const result = isNestedRouteTransition(
            transition({
                toName: 'console.fleet-ops.orders.index',
                fromParent: 'console.fleet-ops.orders',
                toParent: 'console.fleet-ops.orders',
            })
        );

        assert.true(Boolean(result));
    });

    test('it is truthy when both routes share the same parent even if the name differs', function (assert) {
        const result = isNestedRouteTransition(
            transition({
                toName: 'console.other.route',
                fromParent: 'console.fleet-ops',
                toParent: 'console.fleet-ops',
            })
        );

        assert.true(Boolean(result), 'matching parents make it nested');
    });

    test('it is falsy for an unrelated transition', function (assert) {
        const result = isNestedRouteTransition(
            transition({
                toName: 'console.billing.index',
                fromParent: 'console.fleet-ops',
                toParent: 'console.billing',
            })
        );

        assert.false(Boolean(result));
    });

    test('it is falsy when the origin has no parent', function (assert) {
        const result = isNestedRouteTransition(
            transition({
                toName: 'console.billing.index',
                fromParent: undefined,
                toParent: 'console.billing',
            })
        );

        assert.false(Boolean(result));
    });
});

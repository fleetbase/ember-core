import groupApiEvents from 'dummy/utils/group-api-events';
import { module, test } from 'qunit';

module('Unit | Utility | group-api-events', function () {
    test('it groups events by their resource prefix', function (assert) {
        const grouped = groupApiEvents(['order.created', 'order.updated', 'driver.assigned']);

        assert.deepEqual(Object.keys(grouped).sort(), ['driver', 'order']);
        assert.deepEqual(grouped.order, ['order.created', 'order.updated']);
        assert.deepEqual(grouped.driver, ['driver.assigned']);
    });

    test('it groups an event with no separator under its own name', function (assert) {
        assert.deepEqual(groupApiEvents(['ping']), { ping: ['ping'] });
    });

    test('it returns an empty object for empty or non-array input', function (assert) {
        assert.deepEqual(groupApiEvents([]), {});
        assert.deepEqual(groupApiEvents(), {});
        assert.deepEqual(groupApiEvents(null), {});
        assert.deepEqual(groupApiEvents('order.created'), {}, 'a bare string is not treated as a list');
    });
});

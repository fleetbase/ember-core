import macrosGroupBy from 'dummy/utils/macros/group-by';
import { module, test } from 'qunit';
import EmberObject from '@ember/object';

/**
 * A computed macro that buckets a collection by one property. Each bucket
 * records the property name, the shared value, and the items — and buckets
 * appear in the order their value was first seen, not sorted.
 */
module('Unit | Utility | macros/group-by', function () {
    function subject(orders) {
        return class extends EmberObject {
            orders = orders;
            byStatus = macrosGroupBy('orders', 'status');
        }.create();
    }

    test('items sharing a value are collected into one group', function (assert) {
        const groups = subject([{ status: 'active' }, { status: 'active' }, { status: 'done' }]).byStatus;

        assert.deepEqual(
            groups.map((g) => ({ value: g.value, count: g.items.length })),
            [
                { value: 'active', count: 2 },
                { value: 'done', count: 1 },
            ]
        );
    });

    test('each group records the property it grouped on', function (assert) {
        const groups = subject([{ status: 'active' }]).byStatus;

        assert.strictEqual(groups[0].property, 'status');
    });

    test('groups appear in first-seen order rather than sorted', function (assert) {
        const groups = subject([{ status: 'zulu' }, { status: 'alpha' }]).byStatus;

        assert.deepEqual(
            groups.map((g) => g.value),
            ['zulu', 'alpha']
        );
    });

    test('the items themselves are kept, not copies', function (assert) {
        const order = { status: 'active' };

        assert.strictEqual(subject([order]).byStatus[0].items[0], order);
    });

    test('an empty collection yields no groups', function (assert) {
        assert.deepEqual(subject([]).byStatus.length, 0);
    });

    test('a missing collection yields no groups', function (assert) {
        assert.deepEqual(subject(undefined).byStatus.length, 0);
    });

    test('items missing the property are grouped under undefined', function (assert) {
        const groups = subject([{ status: 'active' }, {}, {}]).byStatus;

        assert.strictEqual(groups.length, 2);
        assert.strictEqual(groups[1].value, undefined);
        assert.strictEqual(groups[1].items.length, 2);
    });

    test('falsy values each get their own group', function (assert) {
        const groups = subject([{ status: 0 }, { status: '' }, { status: false }, { status: 0 }]).byStatus;

        assert.deepEqual(
            groups.map((g) => ({ value: g.value, count: g.items.length })),
            [
                { value: 0, count: 2 },
                { value: '', count: 1 },
                { value: false, count: 1 },
            ],
            'they are distinguished by value, not truthiness'
        );
    });

    test('the macro is read only', function (assert) {
        const instance = subject([{ status: 'active' }]);

        assert.throws(() => instance.set('byStatus', []), /Cannot set read-only property/);
    });
});

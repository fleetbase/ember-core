import groupBy from 'dummy/utils/group-by';
import { module, test } from 'qunit';

module('Unit | Utility | group-by', function () {
    test('it groups array items by a string key', function (assert) {
        const items = [
            { type: 'fruit', name: 'apple' },
            { type: 'veg', name: 'carrot' },
            { type: 'fruit', name: 'banana' },
        ];

        const grouped = groupBy(items, 'type');

        assert.deepEqual(Object.keys(grouped).sort(), ['fruit', 'veg']);
        assert.deepEqual(
            grouped.fruit.map((item) => item.name),
            ['apple', 'banana']
        );
        assert.deepEqual(
            grouped.veg.map((item) => item.name),
            ['carrot']
        );
    });

    test('it groups by nested paths', function (assert) {
        const items = [
            { meta: { kind: 'a' }, id: 1 },
            { meta: { kind: 'a' }, id: 2 },
            { meta: { kind: 'b' }, id: 3 },
        ];

        const grouped = groupBy(items, 'meta.kind');

        assert.deepEqual(
            grouped.a.map((item) => item.id),
            [1, 2]
        );
        assert.deepEqual(
            grouped.b.map((item) => item.id),
            [3]
        );
    });

    test('it groups using a callback function receiving item and index', function (assert) {
        const items = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];
        const receivedIndexes = [];

        const grouped = groupBy(items, (item, index) => {
            receivedIndexes.push(index);
            return item.n % 2 === 0 ? 'even' : 'odd';
        });

        assert.deepEqual(receivedIndexes, [0, 1, 2, 3]);
        assert.deepEqual(
            grouped.even.map((item) => item.n),
            [2, 4]
        );
        assert.deepEqual(
            grouped.odd.map((item) => item.n),
            [1, 3]
        );
    });

    test('it groups items with missing keys under undefined', function (assert) {
        const items = [{ type: 'x' }, { other: true }];

        const grouped = groupBy(items, 'type');

        assert.deepEqual(grouped.x, [{ type: 'x' }]);
        assert.deepEqual(grouped.undefined, [{ other: true }]);
    });

    test('it returns an empty object for an empty array', function (assert) {
        assert.deepEqual(groupBy([], 'type'), {});
    });
});

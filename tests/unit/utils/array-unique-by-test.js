import arrayUniqueBy from 'dummy/utils/array-unique-by';
import { module, test } from 'qunit';

module('Unit | Utility | array-unique-by', function () {
    test('it removes duplicates by the given key keeping the first occurrence', function (assert) {
        const items = [
            { id: 1, label: 'first' },
            { id: 2, label: 'second' },
            { id: 1, label: 'duplicate' },
        ];

        const unique = arrayUniqueBy(items, 'id');

        assert.strictEqual(unique.length, 2);
        assert.strictEqual(unique[0].label, 'first');
        assert.strictEqual(unique[1].label, 'second');
    });

    test('it returns a new array and leaves the input untouched', function (assert) {
        const items = [{ id: 1 }, { id: 1 }];
        const unique = arrayUniqueBy(items, 'id');

        assert.notStrictEqual(unique, items);
        assert.strictEqual(items.length, 2, 'input is not mutated');
    });

    test('it groups items missing the key together', function (assert) {
        const unique = arrayUniqueBy([{ other: 1 }, { other: 2 }], 'id');

        assert.strictEqual(unique.length, 1, 'both have undefined ids so only one is kept');
    });

    test('it returns an empty array for empty input', function (assert) {
        assert.deepEqual(arrayUniqueBy([], 'id'), []);
    });
});

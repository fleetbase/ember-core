import first from 'dummy/utils/first';
import { module, test } from 'qunit';

module('Unit | Utility | first', function () {
    test('it returns the first element by default', function (assert) {
        assert.strictEqual(first([1, 2, 3]), 1);
        assert.strictEqual(first(['a']), 'a');
    });

    test('it returns the first n elements as an array when n > 1', function (assert) {
        assert.deepEqual(first([1, 2, 3], 2), [1, 2]);
        assert.deepEqual(first([1, 2, 3], 3), [1, 2, 3]);
    });

    test('it clamps n to the array length', function (assert) {
        assert.deepEqual(first([1, 2], 5), [1, 2]);
    });

    test('it returns null for non-arrays, empty arrays, and non-positive n', function (assert) {
        assert.strictEqual(first(null), null);
        assert.strictEqual(first(undefined), null);
        assert.strictEqual(first('string'), null);
        assert.strictEqual(first({}), null);
        assert.strictEqual(first([]), null);
        assert.strictEqual(first([1, 2], 0), null);
        assert.strictEqual(first([1, 2], -1), null);
    });

    test('it returns the single element when n is exactly 1', function (assert) {
        assert.strictEqual(first([7, 8], 1), 7);
    });
});

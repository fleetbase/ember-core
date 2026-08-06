import last from 'dummy/utils/last';
import { module, test } from 'qunit';

module('Unit | Utility | last', function () {
    test('it returns the last element by default', function (assert) {
        assert.strictEqual(last([1, 2, 3]), 3);
        assert.strictEqual(last(['only']), 'only');
    });

    test('it returns the last n elements in original order when n > 1', function (assert) {
        assert.deepEqual(last([1, 2, 3], 2), [2, 3]);
        assert.deepEqual(last([1, 2, 3], 3), [1, 2, 3]);
    });

    test('it returns an empty array when n is 0', function (assert) {
        assert.deepEqual(last([1, 2, 3], 0), []);
    });

    test('it falls back to the single last element when n is not a number', function (assert) {
        assert.strictEqual(last([1, 2, 3], 'two'), 3);
        assert.strictEqual(last([1, 2, 3], NaN), 3);
        assert.strictEqual(last([1, 2, 3], Infinity), 3);
    });

    test('it returns null for non-arrays and empty arrays', function (assert) {
        assert.strictEqual(last(null), null);
        assert.strictEqual(last(undefined), null);
        assert.strictEqual(last('string'), null);
        assert.strictEqual(last({}), null);
        assert.strictEqual(last([]), null);
    });
});

import range from 'dummy/utils/range';
// The app re-export only forwards the default export, so the named helper has
// to come from the addon module itself.
import { _range } from '@fleetbase/ember-core/utils/range';
import { module, test } from 'qunit';

module('Unit | Utility | range', function () {
    test('it builds numeric ranges inclusively', function (assert) {
        assert.deepEqual(range(1, 5), [1, 2, 3, 4, 5]);
        assert.deepEqual(range(0, 0), [0]);
        assert.deepEqual(range(-2, 1), [-2, -1, 0, 1]);
    });

    test('it builds character ranges from single letters', function (assert) {
        assert.deepEqual(range('a', 'e'), ['a', 'b', 'c', 'd', 'e']);
        assert.deepEqual(range('X', 'Z'), ['X', 'Y', 'Z']);
    });

    test('it falls back to the numeric range for unclassified coercible input', function (assert) {
        // Booleans are neither numeric strings nor letters; true coerces to 1.
        assert.deepEqual(range(true, true), [1]);
    });

    test('the underlying _range helper is exported and inclusive', function (assert) {
        assert.deepEqual(_range(3, 5), [3, 4, 5]);
    });
});

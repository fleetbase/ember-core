import isIterable from 'dummy/utils/is-iterable';
import { module, test } from 'qunit';

module('Unit | Utility | is-iterable', function () {
    test('it returns true for built-in iterables', function (assert) {
        assert.true(isIterable([]));
        assert.true(isIterable([1, 2]));
        assert.true(isIterable('string'));
        assert.true(isIterable(new Set()));
        assert.true(isIterable(new Map()));
    });

    test('it returns true for objects implementing Symbol.iterator', function (assert) {
        const custom = {
            *[Symbol.iterator]() {
                yield 1;
            },
        };

        assert.true(isIterable(custom));
    });

    test('it returns false for nullish values', function (assert) {
        assert.false(isIterable(null));
        assert.false(isIterable(undefined));
    });

    test('it returns false for non-iterable values', function (assert) {
        assert.false(isIterable({}));
        assert.false(isIterable(42));
        assert.false(isIterable(true));
        assert.false(isIterable({ [Symbol.iterator]: 'not a function' }));
    });
});

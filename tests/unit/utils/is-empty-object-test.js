import isEmptyObject from 'dummy/utils/is-empty-object';
import { module, test } from 'qunit';

module('Unit | Utility | is-empty-object', function () {
    test('it returns true for blank values', function (assert) {
        assert.true(isEmptyObject(null));
        assert.true(isEmptyObject(undefined));
        assert.true(isEmptyObject(''));
    });

    test('it returns true for an empty plain object', function (assert) {
        assert.true(isEmptyObject({}));
    });

    test('it returns false for objects with keys', function (assert) {
        assert.false(isEmptyObject({ a: 1 }));
    });

    test('it returns false for non-plain constructors even when empty', function (assert) {
        assert.false(isEmptyObject(new Date()));
        assert.false(isEmptyObject([1]));
        assert.false(isEmptyObject(new Map()));
    });
});

import isObject from 'dummy/utils/is-object';
import { module, test } from 'qunit';

module('Unit | Utility | is-object', function () {
    test('it returns true for plain objects', function (assert) {
        assert.true(Boolean(isObject({})));
        assert.true(Boolean(isObject({ a: 1 })));
        assert.true(Boolean(isObject(Object.create({}))));
    });

    test('it returns falsy for non-plain-object values', function (assert) {
        assert.false(Boolean(isObject([])));
        assert.false(Boolean(isObject(null)));
        assert.false(Boolean(isObject(undefined)));
        assert.false(Boolean(isObject('str')));
        assert.false(Boolean(isObject(5)));
        assert.false(Boolean(isObject(true)));
        assert.false(Boolean(isObject(new Date())));
        assert.false(Boolean(isObject(() => {})));
    });

    test('it short-circuits falsy inputs to the input itself', function (assert) {
        // The implementation returns `obj && ...`, so falsy inputs pass through.
        assert.strictEqual(isObject(null), null);
        assert.strictEqual(isObject(0), 0);
        assert.strictEqual(isObject(''), '');
    });
});

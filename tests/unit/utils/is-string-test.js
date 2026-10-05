import isString from 'dummy/utils/is-string';
import { module, test } from 'qunit';

module('Unit | Utility | is-string', function () {
    test('it returns true for strings', function (assert) {
        assert.true(isString(''));
        assert.true(isString('hello'));
        assert.true(isString(String(42)));
    });

    test('it returns false for non-strings', function (assert) {
        assert.false(isString(42));
        assert.false(isString(null));
        assert.false(isString(undefined));
        assert.false(isString(['a']));
        assert.false(isString({}));
        assert.false(isString(new String('boxed')));
    });
});

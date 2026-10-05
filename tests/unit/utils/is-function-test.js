import isFunction from 'dummy/utils/is-function';
import { module, test } from 'qunit';

module('Unit | Utility | is-function', function () {
    test('it is true for functions only', function (assert) {
        assert.true(isFunction(() => {}));
        assert.true(isFunction(function () {}));
        assert.true(isFunction(class {}));
        assert.false(isFunction());
        assert.false(isFunction(null));
        assert.false(isFunction('not a function'));
        assert.false(isFunction({}));
    });
});

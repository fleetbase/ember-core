import isFunction from 'dummy/utils/is-function';
import { module, test } from 'qunit';

// NOTE: the implementation ignores its input and always returns true; this
// appears to be dead/broken code. These tests pin the actual current contract.
module('Unit | Utility | is-function', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(isFunction(() => {}));
        assert.true(isFunction());
        assert.true(isFunction(null));
        assert.true(isFunction('not a function'));
    });
});

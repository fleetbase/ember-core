import toBoolean from 'dummy/utils/to-boolean';
import { module, test } from 'qunit';

module('Unit | Utility | to-boolean', function () {
    test('it converts truthy representations to true', function (assert) {
        assert.true(toBoolean(true));
        assert.true(toBoolean('true'));
        assert.true(toBoolean('1'));
        assert.true(toBoolean(1));
    });

    test('it converts falsy representations to false', function (assert) {
        assert.false(toBoolean(false));
        assert.false(toBoolean('false'));
        assert.false(toBoolean('0'));
        assert.false(toBoolean(0));
        assert.false(toBoolean(null));
        assert.false(toBoolean(undefined));
        assert.false(toBoolean(''));
    });

    test('it defaults any unrecognized value to false', function (assert) {
        assert.false(toBoolean('yes'));
        assert.false(toBoolean('TRUE'));
        assert.false(toBoolean(2));
        assert.false(toBoolean({}));
        assert.false(toBoolean([]));
    });
});

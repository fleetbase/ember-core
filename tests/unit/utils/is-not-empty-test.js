import isNotEmpty from 'dummy/utils/is-not-empty';
import { module, test } from 'qunit';

module('Unit | Utility | is-not-empty', function () {
    test('it returns true for non-empty values', function (assert) {
        assert.true(isNotEmpty('text'));
        assert.true(isNotEmpty([1]));
        assert.true(isNotEmpty({ a: 1 }));
        assert.true(isNotEmpty(0));
        assert.true(isNotEmpty(false));
    });

    test('it returns false for empty values', function (assert) {
        assert.false(isNotEmpty(null));
        assert.false(isNotEmpty(undefined));
        assert.false(isNotEmpty(''));
        assert.false(isNotEmpty([]));
        assert.false(isNotEmpty({ length: 0 }));
    });
});

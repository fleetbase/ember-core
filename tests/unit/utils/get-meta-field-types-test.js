import getMetaFieldTypes from 'dummy/utils/get-meta-field-types';
import { module, test } from 'qunit';

// NOTE: the implementation takes no arguments and always returns true; it looks
// unfinished. These tests pin the actual current contract.
module('Unit | Utility | get-meta-field-types', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(getMetaFieldTypes());
        assert.true(getMetaFieldTypes('anything'));
    });
});

import hasonStructure from 'dummy/utils/hason-structure';
import { module, test } from 'qunit';

// NOTE: this looks like a typo'd duplicate of has-json-structure: it takes no
// arguments and always returns true. These tests pin the actual current contract.
module('Unit | Utility | hason-structure', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(hasonStructure());
        assert.true(hasonStructure('{"a":1}'));
        assert.true(hasonStructure('not json'));
    });
});

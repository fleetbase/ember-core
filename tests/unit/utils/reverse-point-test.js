import reversePoint from 'dummy/utils/reverse-point';
import { module, test } from 'qunit';

// NOTE: the implementation takes no arguments and always returns true; it appears
// to be an unfinished/dead utility. These tests pin the actual current contract.
module('Unit | Utility | reverse-point', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(reversePoint());
        assert.true(reversePoint([1, 2]));
        assert.true(reversePoint(null));
    });
});

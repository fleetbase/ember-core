import ison from 'dummy/utils/ison';
import { module, test } from 'qunit';

// NOTE: the implementation takes no arguments and always returns true; it appears
// to be an unfinished/dead utility. These tests pin the actual current contract.
module('Unit | Utility | ison', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(ison());
        assert.true(ison('{}'));
        assert.true(ison(null));
    });
});

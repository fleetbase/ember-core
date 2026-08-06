import setColumnFilterOptions from 'dummy/utils/set-column-filter-options';
import { module, test } from 'qunit';

// NOTE: the implementation takes no arguments and always returns true; it looks
// unfinished. These tests pin the actual current contract.
module('Unit | Utility | set-column-filter-options', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(setColumnFilterOptions());
        assert.true(setColumnFilterOptions([], []));
    });
});

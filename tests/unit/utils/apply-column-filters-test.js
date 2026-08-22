import applyColumnFilters from 'dummy/utils/apply-column-filters';
import { module, test } from 'qunit';

// NOTE: the implementation takes no arguments and always returns true; it looks
// unfinished. These tests pin the actual current contract.
module('Unit | Utility | apply-column-filters', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(applyColumnFilters());
        assert.true(applyColumnFilters([], {}));
    });
});

import isNumeric from 'dummy/utils/is-numeric';
import { module, test } from 'qunit';

module('Unit | Utility | is-numeric', function () {
    test('it accepts numbers and numeric strings', function (assert) {
        assert.true(isNumeric(0));
        assert.true(isNumeric(-12.5));
        assert.true(isNumeric('42'));
        assert.true(isNumeric('3.14'));
        assert.true(isNumeric('-7'));
        assert.true(isNumeric('1e3'));
    });

    test('it rejects non-numeric values', function (assert) {
        assert.false(isNumeric('abc'));
        assert.false(isNumeric('12abc'));
        assert.false(isNumeric(''));
        assert.false(isNumeric(null));
        assert.false(isNumeric(undefined));
        assert.false(isNumeric(NaN));
        assert.false(isNumeric(Infinity));
        assert.false(isNumeric({}));
        assert.false(isNumeric([1, 2]));
    });
});

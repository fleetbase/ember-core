import isLongitude from 'dummy/utils/is-longitude';
import { module, test } from 'qunit';

module('Unit | Utility | is-longitude', function () {
    test('it accepts longitudes within [-180, 180]', function (assert) {
        assert.true(isLongitude(0));
        assert.true(isLongitude(180));
        assert.true(isLongitude(-180));
        assert.true(isLongitude('120.5'));
    });

    test('it rejects out-of-range and non-finite values', function (assert) {
        assert.false(isLongitude(180.0001));
        assert.false(isLongitude(-181));
        assert.false(isLongitude(NaN));
        assert.false(isLongitude(-Infinity));
        assert.false(isLongitude('east'));
        assert.false(isLongitude(null && undefined));
    });
});

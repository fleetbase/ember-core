import isLatitude from 'dummy/utils/is-latitude';
import { module, test } from 'qunit';

module('Unit | Utility | is-latitude', function () {
    test('it accepts latitudes within [-90, 90]', function (assert) {
        assert.true(isLatitude(0));
        assert.true(isLatitude(90));
        assert.true(isLatitude(-90));
        assert.true(isLatitude(45.5));
    });

    test('it coerces numeric strings', function (assert) {
        assert.true(isLatitude('45'));
        assert.true(isLatitude('-89.9'));
    });

    test('it rejects out-of-range and non-finite values', function (assert) {
        assert.false(isLatitude(90.0001));
        assert.false(isLatitude(-91));
        assert.false(isLatitude(NaN));
        assert.false(isLatitude(Infinity));
        assert.false(isLatitude('abc'));
        assert.false(isLatitude(undefined));
    });
});

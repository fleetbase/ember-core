import extractCoordinates from 'dummy/utils/extract-coordinates';
import { module, test } from 'qunit';

module('Unit | Utility | extract-coordinates', function () {
    test('it returns latitude and longitude in latlng order by default', function (assert) {
        assert.deepEqual(extractCoordinates([45, 120]), [45, 120]);
    });

    test('it returns lnglat order when requested', function (assert) {
        assert.deepEqual(extractCoordinates([45, 120], 'lnglat'), [120, 45]);
    });

    test('it picks the first value that is a valid latitude', function (assert) {
        // 120 cannot be a latitude, so it is taken as the longitude and 45 as the latitude.
        assert.deepEqual(extractCoordinates([120, 45]), [45, 120]);
    });

    test('it defaults both coordinates to zero when none are found', function (assert) {
        // Regression: the missing-longitude branch used to reassign latitude,
        // leaving longitude null and returning [0, null].
        assert.deepEqual(extractCoordinates([]), [0, 0]);
        assert.deepEqual(extractCoordinates(), [0, 0]);
        assert.deepEqual(extractCoordinates([], 'lnglat'), [0, 0]);
    });

    test('it defaults a missing longitude to zero while keeping the latitude', function (assert) {
        assert.deepEqual(extractCoordinates([45]), [45, 0]);
    });

    test('it ignores values that are neither valid latitude nor longitude', function (assert) {
        assert.deepEqual(extractCoordinates([999, 'abc']), [0, 0]);
    });
});

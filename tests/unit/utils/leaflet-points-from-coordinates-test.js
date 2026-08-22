import leafletPointsFromCoordinates from 'dummy/utils/leaflet-points-from-coordinates';
import { module, test } from 'qunit';

// NOTE: the implementation takes no arguments and always returns true; it appears
// to be an unfinished/dead utility. These tests pin the actual current contract.
module('Unit | Utility | leaflet-points-from-coordinates', function () {
    test('it currently returns true regardless of input', function (assert) {
        assert.true(leafletPointsFromCoordinates());
        assert.true(leafletPointsFromCoordinates([[1, 2]]));
    });
});

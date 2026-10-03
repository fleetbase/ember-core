import leafletPointsFromCoordinates from 'dummy/utils/leaflet-points-from-coordinates';
import { module, test } from 'qunit';

module('Unit | Utility | leaflet-points-from-coordinates', function () {
    test('it turns GeoJSON [lng, lat] coordinates into Leaflet [lat, lng] points', function (assert) {
        assert.deepEqual(
            leafletPointsFromCoordinates([
                [103.8, 1.35],
                [103.9, 1.3],
            ]),
            [
                [1.35, 103.8],
                [1.3, 103.9],
            ]
        );
    });

    test('anything but an array yields no points', function (assert) {
        assert.deepEqual(leafletPointsFromCoordinates(), []);
        assert.deepEqual(leafletPointsFromCoordinates(null), []);
    });
});

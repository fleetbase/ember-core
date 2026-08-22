import polyline from 'dummy/utils/polyline';
import { module, test } from 'qunit';

/**
 * An implementation of Google's encoded polyline algorithm. The fixtures below
 * are the canonical example from Google's specification, so these assert
 * against the published format rather than against this implementation's own
 * output.
 *
 * @see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
const GOOGLE_EXAMPLE_POINTS = [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
];
const GOOGLE_EXAMPLE_ENCODED = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

module('Unit | Utility | polyline', function () {
    module('encode', function () {
        test('it produces the published encoding of the reference points', function (assert) {
            assert.strictEqual(polyline.encode(GOOGLE_EXAMPLE_POINTS), GOOGLE_EXAMPLE_ENCODED);
        });

        test('an empty list encodes to an empty string', function (assert) {
            assert.strictEqual(polyline.encode([]), '');
        });

        test('a single point encodes', function (assert) {
            assert.strictEqual(polyline.encode([[38.5, -120.2]]), '_p~iF~ps|U');
        });

        test('precision is configurable', function (assert) {
            const encoded = polyline.encode(GOOGLE_EXAMPLE_POINTS, 6);

            assert.notStrictEqual(encoded, GOOGLE_EXAMPLE_ENCODED, 'a different precision is a different string');
            assert.deepEqual(polyline.decode(encoded, 6), GOOGLE_EXAMPLE_POINTS, 'and round-trips at that precision');
        });

        test('a non-integer precision falls back to the default', function (assert) {
            assert.strictEqual(polyline.encode(GOOGLE_EXAMPLE_POINTS, 'five'), GOOGLE_EXAMPLE_ENCODED);
        });

        test('negative coordinates round away from zero, as the algorithm requires', function (assert) {
            assert.deepEqual(polyline.decode(polyline.encode([[-38.5, -120.2]])), [[-38.5, -120.2]]);
        });
    });

    module('decode', function () {
        test('it decodes the published example', function (assert) {
            assert.deepEqual(polyline.decode(GOOGLE_EXAMPLE_ENCODED), GOOGLE_EXAMPLE_POINTS);
        });

        test('an empty string decodes to no points', function (assert) {
            assert.deepEqual(polyline.decode(''), []);
        });

        test('encoding and decoding round-trips', function (assert) {
            const points = [
                [1.10001, 2.20002],
                [-3.30003, 4.40004],
            ];

            assert.deepEqual(polyline.decode(polyline.encode(points)), points);
        });
    });

    module('GeoJSON', function () {
        test('a LineString geometry encodes with its coordinates flipped', function (assert) {
            const geojson = {
                type: 'LineString',
                coordinates: GOOGLE_EXAMPLE_POINTS.map(([lat, lng]) => [lng, lat]),
            };

            assert.strictEqual(polyline.fromGeoJSON(geojson), GOOGLE_EXAMPLE_ENCODED, 'GeoJSON is lng,lat and polylines are lat,lng');
        });

        test('a Feature is unwrapped to its geometry', function (assert) {
            const feature = {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: GOOGLE_EXAMPLE_POINTS.map(([lat, lng]) => [lng, lat]) },
            };

            assert.strictEqual(polyline.fromGeoJSON(feature), GOOGLE_EXAMPLE_ENCODED);
        });

        test('anything that is not a LineString is refused', function (assert) {
            assert.throws(() => polyline.fromGeoJSON({ type: 'Point', coordinates: [1, 2] }), /must be a GeoJSON LineString/);
            assert.throws(() => polyline.fromGeoJSON(null), /must be a GeoJSON LineString/);
            assert.throws(() => polyline.fromGeoJSON({ type: 'Feature', geometry: { type: 'Point' } }), /must be a GeoJSON LineString/);
        });

        test('toGeoJSON produces a LineString with flipped coordinates', function (assert) {
            assert.deepEqual(polyline.toGeoJSON(GOOGLE_EXAMPLE_ENCODED), {
                type: 'LineString',
                coordinates: GOOGLE_EXAMPLE_POINTS.map(([lat, lng]) => [lng, lat]),
            });
        });

        test('the GeoJSON helpers round-trip', function (assert) {
            const geojson = polyline.toGeoJSON(GOOGLE_EXAMPLE_ENCODED);

            assert.strictEqual(polyline.fromGeoJSON(geojson), GOOGLE_EXAMPLE_ENCODED);
        });

        test('precision carries through both directions', function (assert) {
            const geojson = polyline.toGeoJSON(polyline.fromGeoJSON({ type: 'LineString', coordinates: [[-120.2, 38.5]] }, 6), 6);

            assert.deepEqual(geojson.coordinates, [[-120.2, 38.5]]);
        });
    });
});

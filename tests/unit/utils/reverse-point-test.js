import reversePoint from 'dummy/utils/reverse-point';
import { module, test } from 'qunit';

module('Unit | Utility | reverse-point', function () {
    test('it swaps the axes of a coordinate pair', function (assert) {
        assert.deepEqual(reversePoint([103.8, 1.35]), [1.35, 103.8]);
    });

    test('anything after the first two values is kept', function (assert) {
        assert.deepEqual(reversePoint([103.8, 1.35, 12]), [1.35, 103.8, 12]);
    });

    test('it swaps the coordinates of a GeoJSON point', function (assert) {
        const point = { type: 'Point', coordinates: [103.8, 1.35] };

        assert.deepEqual(reversePoint(point), { type: 'Point', coordinates: [1.35, 103.8] });
        assert.deepEqual(point.coordinates, [103.8, 1.35], 'the input is not modified');
    });

    test('anything else comes back as given', function (assert) {
        assert.strictEqual(reversePoint(), undefined);
        assert.strictEqual(reversePoint(null), null);
        assert.deepEqual(reversePoint([1]), [1]);
        assert.deepEqual(reversePoint({ type: 'LineString', coordinates: [] }), { type: 'LineString', coordinates: [] });
        assert.deepEqual(reversePoint({ type: 'Point' }), { type: 'Point' });
    });
});

import waypointLabel from 'dummy/utils/waypoint-label';
import { module, test } from 'qunit';

module('Unit | Utility | waypoint-label', function () {
    test('it labels waypoints alphabetically from zero', function (assert) {
        assert.strictEqual(waypointLabel(0), '9', 'index 0 is still numeric');
        assert.strictEqual(waypointLabel(1), 'A');
        assert.strictEqual(waypointLabel(2), 'B');
        assert.strictEqual(waypointLabel(26), 'Z');
    });

    test('it rolls over into multiple characters past Z', function (assert) {
        assert.strictEqual(waypointLabel(27), '10');
        assert.strictEqual(waypointLabel(35), '18');
    });

    test('it handles negative indexes', function (assert) {
        assert.strictEqual(waypointLabel(-9), '0');
        assert.strictEqual(waypointLabel(-10), '-1');
    });
});

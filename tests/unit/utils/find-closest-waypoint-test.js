import findClosestWaypoint from 'dummy/utils/find-closest-waypoint';
import { module, test } from 'qunit';

// Waypoints expose their coordinates through an Ember-object `place`, so the
// fixture mirrors that shape rather than a plain object.
function waypoint(name, latitude, longitude) {
    return {
        name,
        place: {
            get: () => ({ latitude, longitude }),
        },
    };
}

const BERLIN = [52.52, 13.405];

module('Unit | Utility | find-closest-waypoint', function () {
    test('it returns the nearest waypoint', function (assert) {
        const near = waypoint('near', 52.53, 13.41);
        const far = waypoint('far', 48.8566, 2.3522);

        const closest = findClosestWaypoint(BERLIN[0], BERLIN[1], [far, near]);

        assert.strictEqual(closest.name, 'near');
    });

    test('it returns the only waypoint when just one is supplied', function (assert) {
        const only = waypoint('only', 1, 1);

        assert.strictEqual(findClosestWaypoint(BERLIN[0], BERLIN[1], [only]), only);
    });

    test('it returns undefined when there are no waypoints', function (assert) {
        assert.strictEqual(findClosestWaypoint(BERLIN[0], BERLIN[1], []), undefined);
        assert.strictEqual(findClosestWaypoint(BERLIN[0], BERLIN[1]), undefined);
    });

    test('it picks an exact match over every other candidate', function (assert) {
        const exact = waypoint('exact', BERLIN[0], BERLIN[1]);
        const other = waypoint('other', 52.6, 13.5);

        assert.strictEqual(findClosestWaypoint(BERLIN[0], BERLIN[1], [other, exact]).name, 'exact');
    });
});

import makeDataset, { makeMockDataset, randomInt, randomDateThisMonth, range } from 'dummy/utils/make-dataset';
import { module, test } from 'qunit';
import { startOfMonth, endOfMonth } from 'date-fns';

/**
 * makeDataset turns a list of records into {x, y} points — one per calendar
 * day, with y as that day's count — for a time-series chart.
 */
function record(date) {
    return { created_at: date };
}

module('Unit | Utility | make-dataset', function () {
    module('makeDataset', function () {
        test('it counts records per day', function (assert) {
            const dataset = makeDataset([record('2026-03-01T09:00:00Z'), record('2026-03-01T18:00:00Z'), record('2026-03-02T09:00:00Z')]);

            assert.deepEqual(
                dataset.map((point) => point.y),
                [2, 1]
            );
        });

        test('each point carries the day as a date', function (assert) {
            const [point] = makeDataset([record('2026-03-01T09:00:00Z')]);

            assert.true(point.x instanceof Date);
            assert.strictEqual(point.x.getFullYear(), 2026);
            assert.strictEqual(point.x.getMonth(), 2, 'March');
            assert.strictEqual(point.x.getDate(), 1);
        });

        test('the day boundary is local midnight, not the record time', function (assert) {
            const [point] = makeDataset([record('2026-03-01T09:00:00Z')]);

            assert.strictEqual(point.x.getHours(), 0);
            assert.strictEqual(point.x.getMinutes(), 0);
        });

        test('an empty list yields no points', function (assert) {
            assert.deepEqual(makeDataset([]), []);
        });

        test('records are filtered before grouping', function (assert) {
            const records = [record('2026-03-01T09:00:00Z'), record('2026-03-02T09:00:00Z')];

            const dataset = makeDataset(records, (r) => r.created_at.startsWith('2026-03-01'));

            assert.strictEqual(dataset.length, 1);
            assert.strictEqual(dataset[0].y, 1);
        });

        test('the default filter drops falsy records', function (assert) {
            assert.deepEqual(makeDataset([null, undefined, 0]), [], 'nothing survives Boolean');
        });

        test('a different date property can be grouped on', function (assert) {
            const dataset = makeDataset([{ completed_at: '2026-03-01T09:00:00Z' }, { completed_at: '2026-03-01T10:00:00Z' }], Boolean, 'completed_at');

            assert.deepEqual(
                dataset.map((point) => point.y),
                [2]
            );
        });

        test('it accepts Date instances as well as strings', function (assert) {
            const dataset = makeDataset([record(new Date('2026-03-01T09:00:00Z')), record(new Date('2026-03-01T20:00:00Z'))]);

            assert.deepEqual(
                dataset.map((point) => point.y),
                [2]
            );
        });

        test('it returns a new array rather than the grouped one', function (assert) {
            const records = [record('2026-03-01T09:00:00Z')];

            assert.notStrictEqual(makeDataset(records), makeDataset(records));
        });

        test('the trailing sort is a no-op and leaves grouping order intact', function (assert) {
            // Pinned, not fixed: the sort comparator is `() => 0`, left in place
            // because the points are {x, y} and the original key it named ('t')
            // does not exist on them. Choosing a real key would change output.
            const dataset = makeDataset([record('2026-03-03T09:00:00Z'), record('2026-03-01T09:00:00Z'), record('2026-03-02T09:00:00Z')]);

            assert.deepEqual(
                dataset.map((point) => point.x.getDate()),
                [3, 1, 2],
                'points come back in first-seen order, not chronological order'
            );
        });
    });

    module('range', function () {
        test('it produces an inclusive interval', function (assert) {
            assert.deepEqual(range(0, 4), [0, 1, 2, 3, 4], 'both ends are included');
        });

        test('a single-point interval yields one entry', function (assert) {
            assert.deepEqual(range(3, 3), [3]);
        });

        test('it can start anywhere', function (assert) {
            assert.deepEqual(range(5, 8), [5, 6, 7, 8]);
        });
    });

    module('randomInt', function () {
        test('it stays within the requested bounds', function (assert) {
            for (let i = 0; i < 50; i++) {
                const value = randomInt(5, 10);
                assert.true(value >= 5 && value < 10, `${value} is within [5, 10)`);
            }
        });

        test('it returns an integer even for fractional bounds', function (assert) {
            assert.true(Number.isInteger(randomInt(1.2, 9.8)));
        });

        test('a single-value range always yields that value', function (assert) {
            assert.strictEqual(randomInt(4, 5), 4);
        });
    });

    module('randomDateThisMonth', function () {
        test('it falls inside the current month', function (assert) {
            const now = new Date();
            const start = startOfMonth(now);
            const end = endOfMonth(now);

            for (let i = 0; i < 20; i++) {
                const date = randomDateThisMonth();
                assert.true(date >= start && date <= end, `${date.toISOString()} is within this month`);
            }
        });
    });

    module('makeMockDataset', function () {
        test('it builds points from generated records', function (assert) {
            const dataset = makeMockDataset(0, 10);

            assert.true(dataset.length > 0, 'at least one day is represented');
            assert.strictEqual(
                dataset.reduce((total, point) => total + point.y, 0),
                11,
                'every generated record is counted exactly once, over an inclusive range'
            );
        });

        test('the narrowest range still generates one record', function (assert) {
            const dataset = makeMockDataset(0, 0);

            assert.strictEqual(dataset.length, 1, 'the range is inclusive, so there is no empty case');
            assert.strictEqual(dataset[0].y, 1);
        });

        test('every point is a date and a count', function (assert) {
            for (const point of makeMockDataset(0, 5)) {
                assert.true(point.x instanceof Date);
                assert.true(Number.isInteger(point.y));
            }
        });
    });
});

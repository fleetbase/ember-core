import calculatePercentage from 'dummy/utils/calculate-percentage';
import { module, test } from 'qunit';

module('Unit | Utility | calculate-percentage', function () {
    test('it calculates the percentage of a number', function (assert) {
        assert.strictEqual(calculatePercentage(50, 200), 100);
        assert.strictEqual(calculatePercentage(25, 80), 20);
        assert.strictEqual(calculatePercentage(100, 42), 42);
    });

    test('it handles zero and negative inputs', function (assert) {
        assert.strictEqual(calculatePercentage(0, 500), 0);
        assert.strictEqual(calculatePercentage(50, 0), 0);
        assert.strictEqual(calculatePercentage(-50, 200), -100);
    });

    test('it propagates NaN for non-numeric input', function (assert) {
        assert.true(Number.isNaN(calculatePercentage('abc', 100)));
        assert.true(Number.isNaN(calculatePercentage(undefined, 100)));
    });
});

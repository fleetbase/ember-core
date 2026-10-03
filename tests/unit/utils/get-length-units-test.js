import getLengthUnits from 'dummy/utils/get-length-units';
import { module, test } from 'qunit';

module('Unit | Utility | get-length-units', function () {
    test('it returns the supported length units as name/value pairs', function (assert) {
        const units = getLengthUnits();

        assert.strictEqual(units.length, 10);
        assert.true(
            units.every((unit) => typeof unit.name === 'string' && typeof unit.value === 'string'),
            'every unit exposes a name and a value'
        );
        assert.deepEqual(
            units.map((unit) => unit.value),
            ['m', 'mm', 'cm', 'dm', 'km', 'in', 'ft', 'yd', 'AE', 'lj']
        );
    });

    test('it returns a fresh array on every call', function (assert) {
        assert.notStrictEqual(getLengthUnits(), getLengthUnits());
    });
});

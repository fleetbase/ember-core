import getWeightUnits from 'dummy/utils/get-weight-units';
import { module, test } from 'qunit';

module('Unit | Utility | get-weight-units', function () {
    test('it returns the supported weight units as name/value pairs', function (assert) {
        const units = getWeightUnits();

        assert.strictEqual(units.length, 7);
        assert.deepEqual(
            units.map((unit) => unit.value),
            ['g', 'kg', 'gr', 'dr', 'oz', 'lb', 't']
        );
        assert.strictEqual(units[0].name, 'Grams');
    });

    test('it returns a fresh array on every call', function (assert) {
        assert.notStrictEqual(getWeightUnits(), getWeightUnits());
    });
});

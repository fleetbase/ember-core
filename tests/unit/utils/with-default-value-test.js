import withDefaultValue from 'dummy/utils/with-default-value';
import { module, test } from 'qunit';

module('Unit | Utility | with-default-value', function () {
    test('it returns the value when it is present', function (assert) {
        assert.strictEqual(withDefaultValue('Fleetbase'), 'Fleetbase');
        assert.strictEqual(withDefaultValue(0), 0);
        assert.false(withDefaultValue(false));
    });

    test('it falls back to N/A for blank values', function (assert) {
        assert.strictEqual(withDefaultValue(null), 'N/A');
        assert.strictEqual(withDefaultValue(undefined), 'N/A');
        assert.strictEqual(withDefaultValue(''), 'N/A');
        assert.strictEqual(withDefaultValue('   '), 'N/A');
        assert.strictEqual(withDefaultValue([]), 'N/A');
    });

    test('it honours a custom default', function (assert) {
        assert.strictEqual(withDefaultValue(null, 'unknown'), 'unknown');
        assert.strictEqual(withDefaultValue('', 0), 0);
    });
});

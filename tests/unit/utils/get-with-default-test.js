import getWithDefault from 'dummy/utils/get-with-default';
import { module, test } from 'qunit';

module('Unit | Utility | get-with-default', function () {
    test('it returns the resolved value when present', function (assert) {
        const obj = { name: 'Fleet', nested: { deep: 7 } };

        assert.strictEqual(getWithDefault(obj, 'name', 'fallback'), 'Fleet');
        assert.strictEqual(getWithDefault(obj, 'nested.deep', 0), 7);
    });

    test('it returns the default only when the value is undefined', function (assert) {
        const obj = { empty: '', zero: 0, nullish: null, no: false };

        assert.strictEqual(getWithDefault(obj, 'missing', 'fallback'), 'fallback');
        assert.strictEqual(getWithDefault(obj, 'nested.missing', 'fallback'), 'fallback');
        assert.strictEqual(getWithDefault(obj, 'empty', 'fallback'), '');
        assert.strictEqual(getWithDefault(obj, 'zero', 'fallback'), 0);
        assert.strictEqual(getWithDefault(obj, 'nullish', 'fallback'), null);
        assert.false(getWithDefault(obj, 'no', 'fallback'));
    });

    test('it returns undefined when no default is supplied', function (assert) {
        assert.strictEqual(getWithDefault({}, 'missing'), undefined);
    });
});

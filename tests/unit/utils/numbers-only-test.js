import numbersOnly from 'dummy/utils/numbers-only';
import { module, test } from 'qunit';

module('Unit | Utility | numbers-only', function () {
    test('it strips all non-digit characters by default', function (assert) {
        assert.strictEqual(numbersOnly('abc123def456'), '123456');
        assert.strictEqual(numbersOnly('+1 (555) 123-4567'), '15551234567');
        assert.strictEqual(numbersOnly('12.34'), '1234');
        assert.strictEqual(numbersOnly('no digits'), '');
    });

    test('it keeps decimal points when keepDecimals is true', function (assert) {
        assert.strictEqual(numbersOnly('$12.34', true), '12.34');
        assert.strictEqual(numbersOnly('a1.b2.c3', true), '1.2.3');
    });

    test('it requires keepDecimals to be exactly true', function (assert) {
        assert.strictEqual(numbersOnly('12.34', 1), '1234');
    });

    test('it passes non-string values through unchanged', function (assert) {
        assert.strictEqual(numbersOnly(1234), 1234);
        assert.strictEqual(numbersOnly(null), null);
        assert.strictEqual(numbersOnly(undefined), undefined);
        const arr = [1];
        assert.strictEqual(numbersOnly(arr), arr);
    });
});

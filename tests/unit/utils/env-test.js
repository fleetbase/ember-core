import env from 'dummy/utils/env';
import { module, test } from 'qunit';

module('Unit | Utility | env', function (hooks) {
    hooks.beforeEach(function () {
        this.originalProcess = window.process;
        window.process = { env: { PRESENT: 'value', EMPTY: '' } };
    });

    hooks.afterEach(function () {
        if (this.originalProcess === undefined) {
            delete window.process;
        } else {
            window.process = this.originalProcess;
        }
    });

    test('it reads a defined environment variable', function (assert) {
        assert.strictEqual(env('PRESENT'), 'value');
    });

    test('it returns an empty string rather than the default when the value is empty', function (assert) {
        assert.strictEqual(env('EMPTY', 'fallback'), '', 'only undefined falls back');
    });

    test('it falls back for undefined variables', function (assert) {
        assert.strictEqual(env('MISSING'), null, 'the default default is null');
        assert.strictEqual(env('MISSING', 'fallback'), 'fallback');
    });
});

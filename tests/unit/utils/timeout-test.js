import timeout from 'dummy/utils/timeout';
import { module, test } from 'qunit';

module('Unit | Utility | timeout', function () {
    test('it resolves with true by default', async function (assert) {
        assert.true(await timeout(1));
    });

    test('it resolves with a supplied response', async function (assert) {
        assert.strictEqual(await timeout(1, { response: 'done' }), 'done');
    });

    test('it falls back to true when the response option is falsy', async function (assert) {
        assert.true(await timeout(1, { response: null }));
        assert.true(await timeout(1, { response: 0 }));
        assert.true(await timeout(1, {}));
    });

    test('it resolves only after the delay has elapsed', async function (assert) {
        let resolved = false;
        const pending = timeout(20).then(() => (resolved = true));

        assert.false(resolved, 'still pending immediately after the call');

        await pending;
        assert.true(resolved);
    });

    test('it defaults the delay when none is given', async function (assert) {
        // The declared default is 300ms; every call site in the addon passes one,
        // so this is the only exercise the default gets.
        const started = performance.now();

        assert.true(await timeout());

        assert.true(performance.now() - started >= 250, 'it waited roughly the default delay');
    });
});

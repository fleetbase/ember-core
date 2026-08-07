import inlineTask, { InlineTask } from 'dummy/utils/inline-task';
import { module, test } from 'qunit';

/**
 * InlineTask is a dependency-free stand-in for an ember-concurrency task: it
 * tracks the running state and the last result, and applies a concurrency
 * strategy when perform is called while a run is still in flight.
 */
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

module('Unit | Utility | inline-task', function () {
    module('construction', function () {
        test('the factory builds an InlineTask', function (assert) {
            assert.true(inlineTask(() => {}) instanceof InlineTask);
        });

        test('it insists on a function', function (assert) {
            assert.throws(() => inlineTask(), /requires a function/);
            assert.throws(() => inlineTask('not a function'), /requires a function/);
        });

        test('a fresh task is idle and has run nothing', function (assert) {
            const task = inlineTask(() => {});

            assert.false(task.isRunning);
            assert.true(task.isIdle);
            assert.strictEqual(task.performCount, 0);
            assert.strictEqual(task.last, null);
            assert.strictEqual(task.lastValue, undefined);
            assert.strictEqual(task.lastSuccessful, null);
            assert.strictEqual(task.lastError, null);
        });
    });

    module('perform', function () {
        test('it resolves with the function result and records it', async function (assert) {
            const task = inlineTask(() => 'result');

            assert.strictEqual(await task.perform(), 'result');
            assert.strictEqual(task.lastValue, 'result');
            assert.strictEqual(await task.lastSuccessful, 'result');
            assert.strictEqual(task.lastError, null);
            assert.strictEqual(task.performCount, 1);
        });

        test('arguments are passed through', async function (assert) {
            const task = inlineTask((a, b) => a + b);

            assert.strictEqual(await task.perform(2, 3), 5);
        });

        test('it awaits an async function', async function (assert) {
            const task = inlineTask(async () => 'later');

            assert.strictEqual(await task.perform(), 'later');
        });

        test('it is running while in flight and idle afterwards', async function (assert) {
            const gate = deferred();
            const task = inlineTask(() => gate.promise);

            const run = task.perform();
            assert.true(task.isRunning);
            assert.false(task.isIdle);

            gate.resolve('done');
            await run;

            assert.false(task.isRunning);
            assert.true(task.isIdle);
        });

        test('last holds the promise of the current run', async function (assert) {
            const task = inlineTask(() => 'result');

            const run = task.perform();

            assert.strictEqual(task.last, run);
            await run;
        });

        test('a context is used as `this`', async function (assert) {
            const context = { name: 'ctx' };
            const task = inlineTask(
                function () {
                    return this.name;
                },
                { context }
            );

            assert.strictEqual(await task.perform(), 'ctx');
        });

        test('without a context the function is called unbound', async function (assert) {
            const task = inlineTask(function () {
                return this;
            });

            assert.strictEqual(await task.perform(), undefined, 'strict-mode module code has no implicit this');
        });

        test('performCount counts every run', async function (assert) {
            const task = inlineTask(() => 'result');

            await task.perform();
            await task.perform();

            assert.strictEqual(task.performCount, 2);
        });

        test('a later run replaces the recorded value', async function (assert) {
            let count = 0;
            const task = inlineTask(() => ++count);

            await task.perform();
            await task.perform();

            assert.strictEqual(task.lastValue, 2);
        });
    });

    module('failure', function () {
        test('the error is rethrown and recorded', async function (assert) {
            const boom = new Error('boom');
            const task = inlineTask(() => {
                throw boom;
            });

            await assert.rejects(task.perform(), (error) => error === boom);
            assert.strictEqual(task.lastError, boom);
            assert.false(task.isRunning, 'a failure still ends the run');
        });

        test('onError is notified', async function (assert) {
            const seen = [];
            const boom = new Error('boom');
            const task = inlineTask(
                () => {
                    throw boom;
                },
                { onError: (error) => seen.push(error) }
            );

            await assert.rejects(task.perform());

            assert.deepEqual(seen, [boom]);
        });

        test('an onError that itself throws does not mask the original error', async function (assert) {
            const boom = new Error('boom');
            const task = inlineTask(
                () => {
                    throw boom;
                },
                {
                    onError: () => {
                        throw new Error('handler failed');
                    },
                }
            );

            await assert.rejects(task.perform(), (error) => error === boom);
        });

        test('a later success clears the recorded error', async function (assert) {
            let shouldFail = true;
            const task = inlineTask(() => {
                if (shouldFail) {
                    throw new Error('boom');
                }
                return 'ok';
            });

            await assert.rejects(task.perform());
            shouldFail = false;
            await task.perform();

            assert.strictEqual(task.lastError, null);
        });

        test('a failure leaves the previous successful value in place', async function (assert) {
            let shouldFail = false;
            const task = inlineTask(() => {
                if (shouldFail) {
                    throw new Error('boom');
                }
                return 'ok';
            });

            await task.perform();
            shouldFail = true;
            await assert.rejects(task.perform());

            assert.strictEqual(await task.lastSuccessful, 'ok');
        });
    });

    module('cancel', function () {
        test('a cancelled run does not record its value', async function (assert) {
            const gate = deferred();
            const task = inlineTask(() => gate.promise);

            const run = task.perform();
            task.cancel();
            gate.resolve('ignored');

            assert.strictEqual(await run, 'ignored', 'the caller still receives the value');
            assert.strictEqual(task.lastValue, undefined, 'but the task does not commit it');
            assert.false(task.isRunning);
        });

        test('a cancelled failure does not record its error', async function (assert) {
            const gate = deferred();
            const task = inlineTask(() => gate.promise);

            const run = task.perform();
            task.cancel();
            gate.reject(new Error('boom'));

            await assert.rejects(run);
            assert.strictEqual(task.lastError, null);
        });

        test('cancelling an idle task is harmless', function (assert) {
            const task = inlineTask(() => 'result');

            task.cancel();

            assert.true(task.isIdle);
        });
    });

    module('strategies', function () {
        test('standard runs concurrently and the last run wins', async function (assert) {
            const gates = [deferred(), deferred()];
            let index = 0;
            const task = inlineTask(() => gates[index++].promise);

            const first = task.perform();
            const second = task.perform();

            assert.strictEqual(task.performCount, 2);

            gates[1].resolve('second');
            await second;
            gates[0].resolve('first');
            await first;

            assert.strictEqual(task.lastValue, 'second', 'the superseded run does not overwrite it');
        });

        test('drop ignores a call made while running', async function (assert) {
            const gate = deferred();
            const task = inlineTask(() => gate.promise, { strategy: 'drop' });

            const first = task.perform();
            const second = task.perform();

            assert.strictEqual(second, first, 'the running promise is handed back');
            assert.strictEqual(task.performCount, 1, 'the dropped call is not counted');

            gate.resolve('done');
            await first;
        });

        test('drop accepts a new call once the task is idle', async function (assert) {
            const task = inlineTask(() => 'result', { strategy: 'drop' });

            await task.perform();
            await task.perform();

            assert.strictEqual(task.performCount, 2);
        });

        test('restartable cancels the run in flight', async function (assert) {
            const gates = [deferred(), deferred()];
            let index = 0;
            const task = inlineTask(() => gates[index++].promise, { strategy: 'restartable' });

            const first = task.perform();
            const second = task.perform();

            assert.strictEqual(task.performCount, 2);

            gates[0].resolve('first');
            await first;
            assert.strictEqual(task.lastValue, undefined, 'the restarted run is discarded');

            gates[1].resolve('second');
            await second;
            assert.strictEqual(task.lastValue, 'second');
        });

        test('an unrecognised strategy behaves like standard', async function (assert) {
            const task = inlineTask(() => 'result', { strategy: 'nonsense' });

            assert.strictEqual(await task.perform(), 'result');
            assert.strictEqual(task.performCount, 1);
        });
    });
});

import MockTask from '@fleetbase/ember-core/utils/mock-task';
import { module, test } from 'qunit';

/**
 * MockTask stands in for an ember-concurrency task in tests and stories: it
 * wraps a function behind the same `perform` call and tracks a running flag.
 */
module('Unit | Utility | mock-task', function () {
    test('it starts idle', function (assert) {
        const task = new MockTask(() => {});

        assert.false(task.isRunning);
    });

    test('perform calls the wrapped function', function (assert) {
        const calls = [];
        const task = new MockTask((...args) => calls.push(args));

        task.perform('a', 2);

        assert.deepEqual(calls, [['a', 2]]);
    });

    test('it reports running only while the function is executing', function (assert) {
        let observed;
        const task = new MockTask(() => (observed = task.isRunning));

        task.perform();

        assert.true(observed, 'running during');
        assert.false(task.isRunning, 'idle afterwards');
    });

    test('it can be performed more than once', function (assert) {
        let count = 0;
        const task = new MockTask(() => (count += 1));

        task.perform();
        task.perform();

        assert.strictEqual(count, 2);
    });

    test('a throwing function propagates and leaves the flag set', function (assert) {
        // Worth knowing before relying on the flag: there is no try/finally, so
        // a function that throws leaves the task permanently reporting running.
        const task = new MockTask(() => {
            throw new Error('boom');
        });

        assert.throws(() => task.perform(), /boom/);
        assert.true(task.isRunning, 'the running flag is never cleared');
    });

    test('the idle flag is spelled isIdel and is never updated', function (assert) {
        // Pinned rather than corrected: `isIdel` is a typo for `isIdle`, and
        // nothing ever writes to it, so it reads true even while running.
        // Renaming it would break any consumer that spells it the same way.
        const task = new MockTask(() => {
            assert.true(task.isIdel, 'still true mid-run');
        });

        assert.true(task.isIdel);
        task.perform();
        assert.strictEqual(task.isIdle, undefined, 'the correctly spelled property does not exist');
    });
});

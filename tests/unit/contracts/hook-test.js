import Hook from '@fleetbase/ember-core/contracts/hook';
import { module, test } from 'qunit';

module('Unit | Contract | hook', function () {
    module('construction from a name', function () {
        test('a bare name gets sensible defaults', function (assert) {
            const hook = new Hook('application:before-model');

            assert.strictEqual(hook.name, 'application:before-model');
            assert.strictEqual(hook.handler, null);
            assert.strictEqual(hook.priority, 0);
            assert.false(hook.runOnce);
            assert.true(hook.enabled);
            assert.ok(hook.id, 'an id is generated when none is supplied');
        });

        test('a handler can be passed as the second argument', function (assert) {
            const handler = () => 'ran';
            const hook = new Hook('order:before-save', handler);

            assert.strictEqual(hook.handler, handler);
        });

        test('options can be passed as the second argument', function (assert) {
            const handler = () => {};
            const hook = new Hook('order:before-save', { handler, priority: 10, once: true, id: 'my-hook', enabled: false });

            assert.strictEqual(hook.handler, handler);
            assert.strictEqual(hook.priority, 10);
            assert.true(hook.runOnce);
            assert.strictEqual(hook.id, 'my-hook');
            assert.false(hook.enabled);
        });

        test('enabled defaults to true but an explicit false is respected', function (assert) {
            assert.true(new Hook('a', {}).enabled);
            assert.false(new Hook('a', { enabled: false }).enabled);
        });
    });

    module('construction from a definition object', function () {
        test('it reads every field from the definition', function (assert) {
            const handler = () => {};
            const hook = new Hook({ name: 'order:created', handler, priority: 5, once: true, id: 'created-hook', enabled: false });

            assert.strictEqual(hook.name, 'order:created');
            assert.strictEqual(hook.handler, handler);
            assert.strictEqual(hook.priority, 5);
            assert.true(hook.runOnce);
            assert.strictEqual(hook.id, 'created-hook');
            assert.false(hook.enabled);
        });

        test('a definition falls back to the same defaults', function (assert) {
            const hook = new Hook({ name: 'order:created' });

            assert.strictEqual(hook.handler, null);
            assert.strictEqual(hook.priority, 0);
            assert.false(hook.runOnce);
            assert.true(hook.enabled);
            assert.ok(hook.id);
        });

        test('a zero priority in a definition is preserved rather than replaced', function (assert) {
            assert.strictEqual(new Hook({ name: 'a', priority: 0 }).priority, 0);
        });

        test('an object without a name silently becomes the name', function (assert) {
            // NOTE: the definition branch is gated on `isObject(x) && x.name`, so a
            // definition that forgot its name falls through to the string branch and
            // the object itself is assigned as the name. It is truthy, so validation
            // passes and the mistake surfaces later rather than here.
            const hook = new Hook({ handler: () => {} });

            assert.strictEqual(typeof hook.name, 'object', 'the object is used as the name');
            assert.strictEqual(hook.handler, null, 'and its handler is not picked up');
        });
    });

    module('validation', function () {
        test('it requires a name', function (assert) {
            assert.throws(() => new Hook(), /Hook requires a name/);
            assert.throws(() => new Hook(''), /Hook requires a name/);
            assert.throws(() => new Hook(null), /Hook requires a name/);
        });
    });

    module('chaining', function () {
        test('execute sets the handler and keeps the option in step', function (assert) {
            const handler = () => {};
            const hook = new Hook('a');

            assert.strictEqual(hook.execute(handler), hook);
            assert.strictEqual(hook.handler, handler);
            assert.strictEqual(hook.getOption('handler'), handler);
        });

        test('withPriority sets the priority', function (assert) {
            const hook = new Hook('a');

            assert.strictEqual(hook.withPriority(10), hook);
            assert.strictEqual(hook.priority, 10);
            assert.strictEqual(hook.getOption('priority'), 10);
        });

        test('once marks the hook as single-run', function (assert) {
            const hook = new Hook('a');

            assert.strictEqual(hook.once(), hook);
            assert.true(hook.runOnce);
            assert.true(hook.getOption('once'));
        });

        test('withId overrides the generated id', function (assert) {
            const hook = new Hook('a');

            assert.strictEqual(hook.withId('custom'), hook);
            assert.strictEqual(hook.id, 'custom');
            assert.strictEqual(hook.getOption('id'), 'custom');
        });

        test('enable, disable and setEnabled toggle the hook', function (assert) {
            const hook = new Hook('a');

            assert.strictEqual(hook.disable(), hook);
            assert.false(hook.enabled);
            assert.false(hook.getOption('enabled'));

            hook.enable();
            assert.true(hook.enabled);

            hook.setEnabled(false);
            assert.false(hook.enabled);
        });

        test('withMetadata stores metadata as an option', function (assert) {
            const hook = new Hook('a');
            const metadata = { source: 'fleet-ops' };

            assert.strictEqual(hook.withMetadata(metadata), hook);
            assert.deepEqual(hook.getOption('metadata'), metadata);
        });

        test('the fluent calls compose', function (assert) {
            const handler = () => {};
            const hook = new Hook('order:before-save').withPriority(10).once().withId('validate').execute(handler);

            assert.strictEqual(hook.priority, 10);
            assert.true(hook.runOnce);
            assert.strictEqual(hook.id, 'validate');
            assert.strictEqual(hook.handler, handler);
        });
    });

    module('toObject', function () {
        test('it exposes every hook property', function (assert) {
            const handler = () => {};
            const hook = new Hook('order:created', { handler, priority: 3, once: true, id: 'h1' });

            const object = hook.toObject();

            assert.strictEqual(object.name, 'order:created');
            assert.strictEqual(object.handler, handler);
            assert.strictEqual(object.priority, 3);
            assert.true(object.once, 'runOnce is exposed as `once`');
            assert.strictEqual(object.id, 'h1');
            assert.true(object.enabled);
        });

        test('it includes any extra options carried on the hook', function (assert) {
            const object = new Hook('a').withMetadata({ source: 'x' }).toObject();

            assert.deepEqual(object.metadata, { source: 'x' });
        });
    });
});

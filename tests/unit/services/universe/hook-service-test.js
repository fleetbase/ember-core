import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Hook from '@fleetbase/ember-core/contracts/hook';

/**
 * HookService lets extensions inject logic at named points. Its hook registry
 * is deliberately an application-level singleton so the app and every engine
 * share one set of hooks.
 *
 * That sharing is exactly what would leak between tests, so each test gets its
 * own stand-in application. The service documents `universe.applicationInstance`
 * as its first choice of container, so this is the supported seam rather than a
 * trick — and one test below asserts the sharing itself.
 */
function fakeApplication() {
    const registrations = new Map();
    return {
        hasRegistration: (key) => registrations.has(key),
        register: (key, value) => registrations.set(key, value),
        resolveRegistration: (key) => registrations.get(key),
    };
}

module('Unit | Service | universe/hook-service', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.application = fakeApplication();
        const testContext = this;

        this.owner.register(
            'service:universe',
            class extends Service {
                get applicationInstance() {
                    return testContext.application;
                }
            }
        );

        this.service = this.owner.lookup('service:universe/hook-service');
    });

    module('registration', function () {
        test('a name and handler register a hook', function (assert) {
            const handler = () => 'result';

            this.service.registerHook('order:before-save', handler);

            const [hook] = this.service.getHooks('order:before-save');
            assert.strictEqual(hook.name, 'order:before-save');
            assert.strictEqual(hook.handler, handler);
            assert.true(hook.enabled, 'hooks are enabled by default');
            assert.strictEqual(hook.priority, 0);
        });

        test('options set priority, id, once and enabled', function (assert) {
            this.service.registerHook('order:before-save', () => {}, { priority: 5, id: 'my-hook', once: true, enabled: false });

            const [hook] = this.service.getHooks('order:before-save');
            assert.strictEqual(hook.priority, 5);
            assert.strictEqual(hook.id, 'my-hook');
            assert.true(hook.once);
            assert.false(hook.enabled);
        });

        test('a Hook instance can be registered directly', function (assert) {
            const hook = new Hook('order:before-save', () => {}).withPriority(3).withId('from-contract');

            this.service.registerHook(hook);

            const [registered] = this.service.getHooks('order:before-save');
            assert.strictEqual(registered.id, 'from-contract');
            assert.strictEqual(registered.priority, 3);
        });

        test('a Hook marked once carries the flag across as `once`', function (assert) {
            this.service.registerHook(new Hook('order:before-save', () => {}).once());

            assert.true(this.service.getHooks('order:before-save')[0].once, 'the contract stores it as runOnce and maps it on the way out');
        });

        test('a plain object is registered as-is', function (assert) {
            const hook = { name: 'order:before-save', handler: () => {}, priority: 1, enabled: true, id: 'plain' };

            this.service.registerHook(hook);

            assert.strictEqual(this.service.getHooks('order:before-save')[0], hook);
        });

        test('hooks are ordered by priority, lowest first', function (assert) {
            this.service.registerHook('evt', () => {}, { id: 'c', priority: 10 });
            this.service.registerHook('evt', () => {}, { id: 'a', priority: -5 });
            this.service.registerHook('evt', () => {}, { id: 'b', priority: 0 });

            assert.deepEqual(
                this.service.getHooks('evt').map((h) => h.id),
                ['a', 'b', 'c']
            );
        });

        test('hooks under different names are kept apart', function (assert) {
            this.service.registerHook('one', () => {});
            this.service.registerHook('two', () => {});

            assert.strictEqual(this.service.getHooks('one').length, 1);
            assert.strictEqual(this.service.getHooks('two').length, 1);
        });

        test('an unregistered name has no hooks', function (assert) {
            assert.deepEqual(this.service.getHooks('nothing'), []);
        });
    });

    module('execute', function () {
        test('it runs every enabled handler and collects the results', async function (assert) {
            this.service.registerHook('evt', () => 'first', { priority: 1 });
            this.service.registerHook('evt', () => 'second', { priority: 2 });

            assert.deepEqual(await this.service.execute('evt'), ['first', 'second']);
        });

        test('arguments are passed to every handler', async function (assert) {
            const seen = [];
            this.service.registerHook('evt', (...args) => seen.push(args));

            await this.service.execute('evt', 'a', 2);

            assert.deepEqual(seen, [['a', 2]]);
        });

        test('async handlers are awaited', async function (assert) {
            this.service.registerHook('evt', async () => 'later');

            assert.deepEqual(await this.service.execute('evt'), ['later']);
        });

        test('handlers run in priority order', async function (assert) {
            const order = [];
            this.service.registerHook('evt', () => order.push('second'), { priority: 10 });
            this.service.registerHook('evt', () => order.push('first'), { priority: 1 });

            await this.service.execute('evt');

            assert.deepEqual(order, ['first', 'second']);
        });

        test('a disabled hook is skipped', async function (assert) {
            this.service.registerHook('evt', () => 'ran', { enabled: false });

            assert.deepEqual(await this.service.execute('evt'), []);
        });

        test('a hook without a handler is skipped', async function (assert) {
            this.service.registerHook({ name: 'evt', enabled: true, id: 'no-handler', priority: 0 });

            assert.deepEqual(await this.service.execute('evt'), []);
        });

        test('a once hook is removed after running', async function (assert) {
            this.service.registerHook('evt', () => 'ran', { once: true, id: 'single' });

            assert.deepEqual(await this.service.execute('evt'), ['ran']);
            assert.deepEqual(this.service.getHooks('evt'), [], 'it does not survive to a second execution');
            assert.deepEqual(await this.service.execute('evt'), []);
        });

        test('a throwing handler does not stop the others', async function (assert) {
            this.service.registerHook(
                'evt',
                () => {
                    throw new Error('boom');
                },
                { priority: 1 }
            );
            this.service.registerHook('evt', () => 'survived', { priority: 2 });

            assert.deepEqual(await this.service.execute('evt'), ['survived'], 'the failed hook contributes no result');
        });

        test('a throwing once hook is not removed', async function (assert) {
            this.service.registerHook(
                'evt',
                () => {
                    throw new Error('boom');
                },
                { once: true, id: 'single' }
            );

            await this.service.execute('evt');

            assert.strictEqual(this.service.getHooks('evt').length, 1, 'removal only happens on a clean run');
        });

        test('executing an unknown name is harmless', async function (assert) {
            assert.deepEqual(await this.service.execute('nothing'), []);
        });
    });

    module('executeSync', function () {
        test('it returns results without awaiting', function (assert) {
            this.service.registerHook('evt', () => 'first', { priority: 1 });
            this.service.registerHook('evt', () => 'second', { priority: 2 });

            assert.deepEqual(this.service.executeSync('evt'), ['first', 'second']);
        });

        test('an async handler yields its promise unresolved', function (assert) {
            this.service.registerHook('evt', async () => 'later');

            const [result] = this.service.executeSync('evt');

            assert.true(result instanceof Promise, 'the sync path does not await');
        });

        test('disabled hooks are skipped and once hooks removed', function (assert) {
            this.service.registerHook('evt', () => 'ran', { once: true, id: 'single' });
            this.service.registerHook('evt', () => 'skipped', { enabled: false, id: 'off' });

            assert.deepEqual(this.service.executeSync('evt'), ['ran']);
            assert.deepEqual(
                this.service.getHooks('evt').map((h) => h.id),
                ['off']
            );
        });

        test('a throwing handler does not stop the others', function (assert) {
            this.service.registerHook(
                'evt',
                () => {
                    throw new Error('boom');
                },
                { priority: 1 }
            );
            this.service.registerHook('evt', () => 'survived', { priority: 2 });

            assert.deepEqual(this.service.executeSync('evt'), ['survived']);
        });
    });

    module('management', function () {
        test('removeHook drops just the named hook', function (assert) {
            this.service.registerHook('evt', () => {}, { id: 'a' });
            this.service.registerHook('evt', () => {}, { id: 'b' });

            this.service.removeHook('evt', 'a');

            assert.deepEqual(
                this.service.getHooks('evt').map((h) => h.id),
                ['b']
            );
        });

        test('removing an unknown hook or name changes nothing', function (assert) {
            this.service.registerHook('evt', () => {}, { id: 'a' });

            this.service.removeHook('evt', 'ghost');
            this.service.removeHook('no-such-name', 'a');

            assert.strictEqual(this.service.getHooks('evt').length, 1);
        });

        test('removeAllHooks empties one name only', function (assert) {
            this.service.registerHook('evt', () => {});
            this.service.registerHook('other', () => {});

            this.service.removeAllHooks('evt');

            assert.deepEqual(this.service.getHooks('evt'), []);
            assert.strictEqual(this.service.getHooks('other').length, 1);
        });

        test('hasHook reports whether any are registered', function (assert) {
            assert.notOk(this.service.hasHook('evt'));

            this.service.registerHook('evt', () => {});
            assert.true(this.service.hasHook('evt'));

            this.service.removeAllHooks('evt');
            assert.false(this.service.hasHook('evt'), 'an emptied name reports false');
        });

        test('hasHook yields undefined rather than false for a name never seen', function (assert) {
            // Worth pinning: the implementation returns `this.hooks[name] && …`,
            // so an unseen name gives undefined. Truthiness is the contract here,
            // not a strict boolean.
            assert.strictEqual(this.service.hasHook('never-registered'), undefined);
        });

        test('disableHook and enableHook flip a single hook', async function (assert) {
            this.service.registerHook('evt', () => 'ran', { id: 'a' });

            this.service.disableHook('evt', 'a');
            assert.deepEqual(await this.service.execute('evt'), []);

            this.service.enableHook('evt', 'a');
            assert.deepEqual(await this.service.execute('evt'), ['ran']);
        });

        test('enabling or disabling an unknown hook is harmless', function (assert) {
            this.service.enableHook('evt', 'ghost');
            this.service.disableHook('evt', 'ghost');

            assert.deepEqual(this.service.getHooks('evt'), []);
        });
    });

    module('the shared registry', function () {
        test('a second service instance sees the same hooks', function (assert) {
            this.service.registerHook('evt', () => {}, { id: 'a' });

            this.owner.register('service:second-hooks', this.service.constructor);
            const second = this.owner.lookup('service:second-hooks');

            assert.deepEqual(
                second.getHooks('evt').map((h) => h.id),
                ['a'],
                'app and engines share one registry'
            );
        });

        test('hooks can be replaced wholesale through the setter', function (assert) {
            this.service.registerHook('evt', () => {});

            this.service.hooks = {};

            assert.deepEqual(this.service.getHooks('evt'), []);
        });

        test('setApplicationInstance records the application', function (assert) {
            const application = fakeApplication();

            this.service.setApplicationInstance(application);

            assert.strictEqual(this.service.applicationInstance, application);
        });
    });

    module('names and handlers that are not there', function () {
        test('executeSync on an unknown name yields no results', function (assert) {
            assert.deepEqual(this.service.executeSync('never-registered'), [], 'the missing list falls back to an empty one');
        });

        test('a hook whose handler is not a function is skipped', function (assert) {
            this.service.registerHook({ name: 'evt', id: 'not-callable', handler: 'oops', enabled: true, priority: 0 });
            this.service.registerHook('evt', () => 'ran');

            assert.deepEqual(this.service.executeSync('evt'), ['ran'], 'only the callable one contributes');
        });

        test('an async execute skips a non-function handler too', async function (assert) {
            this.service.registerHook({ name: 'evt', id: 'not-callable', handler: null, enabled: true, priority: 0 });
            this.service.registerHook('evt', () => 'ran');

            assert.deepEqual(await this.service.execute('evt'), ['ran']);
        });

        test('removeAllHooks on an unknown name is harmless', function (assert) {
            this.service.removeAllHooks('never-registered');

            assert.deepEqual(this.service.getHooks('never-registered'), [], 'and it does not create the list');
            // hasHook returns `this.hooks[name] && ...`, so an unknown name gets
            // undefined rather than false. Pinned as it stands.
            assert.notOk(this.service.hasHook('never-registered'));
        });
    });
});

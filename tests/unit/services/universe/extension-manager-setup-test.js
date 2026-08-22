import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import config from 'dummy/config/environment';

/**
 * `loadExtensions` and `setupExtensions` — the boot-time half of the extension
 * manager.
 *
 * Two module-scope imports look like blockers and are not:
 *
 *  - loadInstalledExtensions reaches the network through the GLOBAL fetch, which
 *    is the seam already used for load-extensions and lookup-user-ip.
 *  - getExtensionLoader comes from '@fleetbase/console/extensions', which the
 *    dummy app supplies as an AMD stub. `import { x } from '…'` compiles to a
 *    property read on the module object at CALL time, so replacing the property
 *    on `window.require('@fleetbase/console/extensions')` redirects it — the
 *    same trick the fetch tests use on ember-fetch.
 */
const EXTENSIONS_MODULE = '@fleetbase/console/extensions';

module('Unit | Service | universe/extension-manager (loading and setup)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.originalFetch = window.fetch;
        this.extensionsModule = window.require(EXTENSIONS_MODULE);
        this.originalGetLoader = this.extensionsModule.getExtensionLoader;
        this.originalAppExtensions = config.APP?.extensions;

        this.indexed = [{ name: '@fleetbase/fleetops-engine', fleetbase: { route: 'fleet-ops' } }];
        this.fetchRejects = false;
        window.fetch = () => {
            if (this.fetchRejects) {
                return Promise.reject(new Error('registry unreachable'));
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve(this.indexed),
                text: () => Promise.resolve(JSON.stringify(this.indexed)),
                clone() {
                    return this;
                },
                blob: () => Promise.resolve(new Blob([])),
                headers: { get: () => 'application/json' },
            });
        };

        this.loaders = {};
        this.extensionsModule.getExtensionLoader = (name) => this.loaders[name];

        this.application = { extensions: undefined, engines: undefined };
        this.appInstance = { application: this.application };

        this.bootCallbacksRun = 0;
        const testContext = this;
        this.universeStub = {
            executeBootCallbacks() {
                testContext.bootCallbacksRun += 1;
                return Promise.resolve();
            },
        };

        this.owner.register(
            'service:universe',
            class extends Service {
                get applicationInstance() {
                    return testContext.registryHost;
                }
            }
        );

        // A minimal container for the boot-state registration the constructor makes.
        const registrations = new Map();
        this.registryHost = {
            hasRegistration: (key) => registrations.has(key),
            register: (key, value) => registrations.set(key, value),
            resolveRegistration: (key) => registrations.get(key),
            lookup: () => undefined,
        };

        this.service = this.owner.factoryFor('service:universe/extension-manager').create();
    });

    hooks.afterEach(function () {
        if (typeof this.originalFetch === 'function') {
            window.fetch = this.originalFetch;
        }
        if (typeof this.originalGetLoader === 'function') {
            this.extensionsModule.getExtensionLoader = this.originalGetLoader;
        }
        if (this.originalAppExtensions === undefined) {
            delete config.APP.extensions;
        } else {
            config.APP.extensions = this.originalAppExtensions;
        }
    });

    module('loadExtensions', function () {
        test('it puts the installed extensions and their engines on the application', async function (assert) {
            const extensions = await this.service.loadExtensions(this.application);

            assert.deepEqual(
                extensions.map((e) => e.name),
                ['@fleetbase/fleetops-engine']
            );
            assert.strictEqual(this.application.extensions, extensions);
            assert.ok(this.application.engines, 'the engine map is built alongside');
        });

        test('an extension that is not a core engine and not installed is filtered out', async function (assert) {
            this.indexed = [{ name: '@fleetbase/fleetops-engine' }, { name: '@acme/not-installed-engine' }];

            const extensions = await this.service.loadExtensions(this.application);

            assert.deepEqual(
                extensions.map((e) => e.name),
                ['@fleetbase/fleetops-engine'],
                'only core engines survive without an authenticated registry'
            );
        });

        test('an admin-configured extension is treated as core', async function (assert) {
            config.APP.extensions = ['@acme/custom-engine'];
            this.indexed = [{ name: '@acme/custom-engine' }];

            const extensions = await this.service.loadExtensions(this.application);

            assert.deepEqual(
                extensions.map((e) => e.name),
                ['@acme/custom-engine']
            );
        });

        test('it marks extensions as loaded', async function (assert) {
            let released = false;
            const waiting = this.service.waitForExtensionsLoaded().then(() => (released = true));

            await this.service.loadExtensions(this.application);
            await waiting;

            assert.true(released);
            assert.true(this.service.extensionsLoaded);
        });

        test('a failure empties the application and still releases the waiters', async function (assert) {
            this.fetchRejects = true;
            const originalConsoleError = console.error;
            console.error = () => {};

            try {
                await assert.rejects(this.service.loadExtensions(this.application));

                assert.deepEqual(this.application.extensions, [], 'so nothing downstream sees stale data');
                assert.deepEqual(this.application.engines, {});
                assert.true(this.service.extensionsLoaded, 'and boot is not left hanging');
            } finally {
                console.error = originalConsoleError;
            }
        });
    });

    module('setupExtensions', function (hooks) {
        hooks.beforeEach(function () {
            this.service.finishLoadingExtensions();
            this.application.extensions = [{ name: '@fleetbase/fleetops-engine' }];
        });

        test('every extension is registered before any is set up', async function (assert) {
            const seen = [];
            this.application.extensions = [{ name: '@fleetbase/a-engine' }, { name: '@fleetbase/b-engine' }];
            this.loaders['@fleetbase/a-engine'] = () => Promise.resolve(() => seen.push(this.service.isInstalled('@fleetbase/b-engine')));

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.deepEqual(seen, [true], 'so isInstalled works for a later extension during an earlier one');
        });

        test('a function export is called with the app instance and universe', async function (assert) {
            const calls = [];
            this.loaders['@fleetbase/fleetops-engine'] = () => Promise.resolve((appInstance, universe) => calls.push({ appInstance, universe }));

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.strictEqual(calls[0].appInstance, this.appInstance);
            assert.strictEqual(calls[0].universe, this.universeStub);
        });

        test('a default export is unwrapped', async function (assert) {
            const calls = [];
            this.loaders['@fleetbase/fleetops-engine'] = () => Promise.resolve({ default: () => calls.push('ran') });

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.deepEqual(calls, ['ran']);
        });

        test('an object export with setupExtension is run', async function (assert) {
            const calls = [];
            this.loaders['@fleetbase/fleetops-engine'] = () => Promise.resolve({ setupExtension: (appInstance, universe) => calls.push({ appInstance, universe }) });

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.strictEqual(calls[0].universe, this.universeStub);
        });

        test('an onEngineLoaded hook is stored rather than run', async function (assert) {
            const calls = [];
            this.loaders['@fleetbase/fleetops-engine'] = () => Promise.resolve({ onEngineLoaded: () => calls.push('ran') });

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.deepEqual(calls, [], 'it waits for the engine');
        });

        test('an extension with no registered loader is skipped', async function (assert) {
            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.true(this.service.isInstalled('@fleetbase/fleetops-engine'), 'it is still registered');
        });

        test('an export that is neither a function nor a usable object is warned about', async function (assert) {
            this.loaders['@fleetbase/fleetops-engine'] = () => Promise.resolve({ nothingUseful: true });

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.true(this.service.isInstalled('@fleetbase/fleetops-engine'), 'and setup carries on');
        });

        test('a loader that throws does not stop the others', async function (assert) {
            const calls = [];
            const originalConsoleError = console.error;
            console.error = () => {};
            this.application.extensions = [{ name: '@fleetbase/a-engine' }, { name: '@fleetbase/b-engine' }];
            this.loaders['@fleetbase/a-engine'] = () => Promise.reject(new Error('bad extension'));
            this.loaders['@fleetbase/b-engine'] = () => Promise.resolve(() => calls.push('b ran'));

            try {
                await this.service.setupExtensions(this.appInstance, this.universeStub);

                assert.deepEqual(calls, ['b ran']);
            } finally {
                console.error = originalConsoleError;
            }
        });

        test('boot callbacks run once every extension is set up', async function (assert) {
            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.strictEqual(this.bootCallbacksRun, 1);
        });

        test('an application with no extensions still completes boot', async function (assert) {
            this.application.extensions = undefined;

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.strictEqual(this.bootCallbacksRun, 1);
        });

        test('a plain string extension is accepted as its own name', async function (assert) {
            const calls = [];
            this.application.extensions = ['@fleetbase/string-engine'];
            this.loaders['@fleetbase/string-engine'] = () => Promise.resolve(() => calls.push('ran'));

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.deepEqual(calls, ['ran']);
            assert.true(this.service.isInstalled('@fleetbase/string-engine'));
        });

        test('a primitive default export is warned about rather than called', async function (assert) {
            // `module.default ?? module` yields the primitive, so neither the
            // function arm nor the object arm applies.
            this.loaders['@fleetbase/fleetops-engine'] = () => Promise.resolve({ default: 42 });

            await this.service.setupExtensions(this.appInstance, this.universeStub);

            assert.true(this.service.isInstalled('@fleetbase/fleetops-engine'), 'and setup carries on');
        });
    });
});

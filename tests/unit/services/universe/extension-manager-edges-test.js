import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';

/**
 * The remaining edges of the extension manager: the boot-state setters, the
 * in-flight and already-built short circuits in engine loading, the registration
 * failures, and the path taken when an engine instance arrives already boot-
 * patched.
 *
 * That last one matters because the service has TWO places that fire the
 * engine-loaded hooks — the boot patch the owner installs, and
 * constructEngineInstance's own `.then`. Only the first runs in the ordinary
 * case; an instance that reports `_bootPatched` already reaches the second.
 */
function fakeEngineInstance(name, { bootPatched = false, registerThrows = false } = {}) {
    return {
        name,
        _bootPatched: bootPatched,
        booted: 0,
        registrations: [],
        resolveRegistration(key) {
            return key === 'config:environment' ? { modulePrefix: name } : undefined;
        },
        boot() {
            this.booted += 1;
            return Promise.resolve(this);
        },
        destroy() {},
        register(fullName, factory, options) {
            if (registerThrows) {
                throw new Error('container is sealed');
            }
            this.registrations.push({ fullName, factory, options });
        },
    };
}

module('Unit | Service | universe/extension-manager (edges)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.built = [];
        this.bootPatched = false;
        this.registerThrows = false;
        this.loadBundleDeferred = null;

        const testContext = this;
        const registrations = new Map();
        const router = {
            _enginePromises: Object.create(null),
            _engineInstances: null,
            _engineIsLoaded: () => false,
            _registerEngine: () => {},
            _assetLoader: {
                loadBundle: () => testContext.loadBundleDeferred ?? Promise.resolve(),
            },
        };

        this.router = router;
        this.universeStub = { name: 'universe service' };

        this.application = {
            hasRegistration: (key) => (key.startsWith('engine:') ? true : registrations.has(key)),
            register: (key, value) => registrations.set(key, value),
            resolveRegistration: (key) => registrations.get(key),
            lookup(fullName) {
                if (fullName === 'router:main') {
                    return router;
                }
                if (fullName === 'service:universe') {
                    return testContext.universeStub;
                }
                return undefined;
            },
            buildChildEngineInstance(name) {
                const instance = fakeEngineInstance(name, { bootPatched: testContext.bootPatched, registerThrows: testContext.registerThrows });
                testContext.built.push(instance);
                return instance;
            },
        };

        this.owner.register(
            'service:universe',
            class extends Service {
                get applicationInstance() {
                    return testContext.application;
                }
            }
        );

        this.originalConsoleError = console.error;
        console.error = () => {};

        this.service = this.owner.factoryFor('service:universe/extension-manager').create();
    });

    hooks.afterEach(function () {
        if (typeof this.originalConsoleError === 'function') {
            console.error = this.originalConsoleError;
        }
    });

    module('the shared boot state', function () {
        test('the collections can be replaced wholesale', function (assert) {
            const engines = new Map([['@fleetbase/a-engine', { name: 'a' }]]);
            const promises = new Map([['@fleetbase/b-engine', Promise.resolve()]]);
            const extensions = [{ name: '@fleetbase/c-engine' }];

            this.service.loadedEngines = engines;
            this.service.loadingPromises = promises;
            this.service.registeredExtensions = extensions;

            assert.strictEqual(this.service.loadedEngines, engines);
            assert.strictEqual(this.service.loadingPromises, promises);
            assert.strictEqual(this.service.registeredExtensions, extensions);
        });

        test('the extensions-loaded promise can be replaced', function (assert) {
            const promise = Promise.resolve('replaced');

            this.service.extensionsLoadedPromise = promise;

            assert.strictEqual(this.service.extensionsLoadedPromise, promise);
        });

        test('a second service shares the same state', function (assert) {
            const engines = new Map([['@fleetbase/a-engine', { name: 'a' }]]);
            this.service.loadedEngines = engines;

            const second = this.owner.factoryFor('service:universe/extension-manager').create();

            assert.strictEqual(second.loadedEngines, engines, 'which is the point of putting it on the application');
        });
    });

    module('loading short circuits', function () {
        test('a load already in flight returns the same promise', async function (assert) {
            let release;
            this.loadBundleDeferred = new Promise((resolve) => (release = resolve));

            const first = this.service.loadEngine('@fleetbase/fleetops-engine');
            const second = this.service.loadEngine('@fleetbase/fleetops-engine');

            assert.strictEqual(second, first, 'the router promise is reused rather than a second bundle requested');

            release();
            await first;
            await settled();
        });

        test('an instance already built is resolved without building another', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            // Clear the manager's own cache so it goes back through #loadEngine,
            // where the router's engineInstances map still holds the instance.
            this.service.loadedEngines.delete('@fleetbase/fleetops-engine');
            this.router._enginePromises = Object.create(null);

            const instance = await this.service.loadEngine('@fleetbase/fleetops-engine');

            assert.strictEqual(this.built.length, 1, 'no second instance was constructed');
            assert.strictEqual(instance, this.built[0]);
        });
    });

    module('an engine that arrives already boot-patched', function (hooks) {
        hooks.beforeEach(function () {
            this.bootPatched = true;
        });

        test('constructEngineInstance fires the hooks itself', async function (assert) {
            const calls = [];
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => calls.push('ran'));

            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            assert.deepEqual(calls, ['ran'], 'the second of the two hook paths');
        });

        test('the engine.loaded event still fires exactly once', async function (assert) {
            const events = [];
            this.service.on('engine.loaded', (name) => events.push(name));

            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            assert.deepEqual(events, ['@fleetbase/fleetops-engine']);
        });
    });

    module('registration failures', function () {
        test('a service registration that throws reports false', async function (assert) {
            this.registerThrows = true;
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            const registered = this.service.registerServiceIntoEngine('@fleetbase/fleetops-engine', 'dispatch', class {});

            assert.false(registered, 'the caller is told rather than the throw escaping');
        });

        test('a component registration that throws reports false too', async function (assert) {
            this.registerThrows = true;
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.false(this.service.registerComponentIntoEngine('@fleetbase/fleetops-engine', 'order-card', class {}));
        });

        test('a failing engine is left out of the all-engines result', async function (assert) {
            this.registerThrows = true;
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(this.service.registerServiceIntoAllEngines('dispatch', class {}), [], 'no engine reports success');
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';

/**
 * The engine-loaded hook plumbing, the owner patch that catches engines loaded
 * through routing rather than through this service, and the parent-dependency
 * fixing that runs just before an engine boots.
 *
 * Same harness as the sibling engine-loading file: a fake application supplied
 * through a `service:universe` stub before the service is built, because the
 * constructor both reads the application and patches it.
 */
function fakeEngineInstance(name, { environment, base } = {}) {
    return {
        name,
        base,
        booted: 0,
        registrations: [],
        resolveRegistration(key) {
            return key === 'config:environment' ? environment : undefined;
        },
        boot() {
            this.booted += 1;
            return Promise.resolve(this);
        },
        destroy() {},
        register(fullName, factory, options) {
            this.registrations.push({ fullName, factory, options });
        },
    };
}

module('Unit | Service | universe/extension-manager (hooks and dependencies)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.built = [];
        this.engineBase = undefined;
        this.services = { 'service:router': { name: 'the router' }, 'service:store': { name: 'the store' } };

        const testContext = this;
        const router = {
            _enginePromises: Object.create(null),
            _engineInstances: null,
            _engineIsLoaded: () => false,
            _registerEngine: () => {},
            _assetLoader: { loadBundle: () => Promise.resolve() },
        };

        this.universeStub = { name: 'universe service' };

        // hasRegistration answers for engines and for the boot-state key alike.
        const registrations = new Map();

        this.application = {
            router,
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
                return testContext.services[fullName];
            },
            buildChildEngineInstance(name) {
                const instance = fakeEngineInstance(name, { environment: { modulePrefix: name }, base: testContext.engineBase });
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

    module('whenEngineLoaded', function () {
        test('a hook registered before the engine loads runs after it boots', async function (assert) {
            const calls = [];
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', (engine, universe, appInstance) => calls.push({ engine, universe, appInstance }));

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0].engine, instance);
            assert.strictEqual(calls[0].universe, this.universeStub, 'the universe service is passed through');
            assert.strictEqual(calls[0].appInstance, this.application);
        });

        test('a hook registered after the engine is loaded runs immediately', async function (assert) {
            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();
            const calls = [];

            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', (engine) => calls.push(engine));

            assert.deepEqual(calls, [instance], 'no waiting');
        });

        test('several hooks for one engine all run', async function (assert) {
            const calls = [];
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => calls.push('first'));
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => calls.push('second'));

            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            assert.deepEqual(calls, ['first', 'second']);
        });

        test('a hook that throws does not stop the others', async function (assert) {
            const calls = [];
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => {
                throw new Error('bad hook');
            });
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => calls.push('second'));

            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            assert.deepEqual(calls, ['second']);
        });

        test('a throwing hook registered after the load is caught too', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();
            const calls = [];

            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => {
                throw new Error('bad hook');
            });
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => calls.push('ran'));

            assert.deepEqual(calls, ['ran'], 'the earlier throw was swallowed and did not break the path');
        });

        test('hooks run once, even though two paths could fire them', async function (assert) {
            const calls = [];
            this.service.whenEngineLoaded('@fleetbase/fleetops-engine', () => calls.push('ran'));

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();
            await instance.boot();
            await settled();

            assert.deepEqual(calls, ['ran'], 'the _hooksTriggered flag prevents a second run');
        });

        test('a hook for an engine that never loads never runs', async function (assert) {
            const calls = [];
            this.service.whenEngineLoaded('@fleetbase/never-engine', () => calls.push('ran'));

            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            assert.deepEqual(calls, []);
        });
    });

    module('the engine.loaded event', function () {
        test('it fires with the name and instance', async function (assert) {
            const events = [];
            this.service.on('engine.loaded', (name, instance) => events.push({ name, instance }));

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            await settled();

            assert.strictEqual(events[0].name, '@fleetbase/fleetops-engine');
            assert.strictEqual(events[0].instance, instance);
        });
    });

    module('parent dependencies fixed before boot', function () {
        test('a named service is resolved from the application', async function (assert) {
            this.engineBase = { dependencies: { services: ['store'] } };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.dependencies.services.store, this.services['service:store']);
        });

        test('hostRouter is resolved from the application router', async function (assert) {
            this.engineBase = { dependencies: { services: ['hostRouter'] } };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.dependencies.services.hostRouter, this.services['service:router'], 'it maps to service:router, not service:hostRouter');
        });

        test('a service the application does not have falls back to its own name', async function (assert) {
            this.engineBase = { dependencies: { services: ['nonexistent'] } };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.dependencies.services.nonexistent, 'nonexistent');
        });

        test('an object entry is merged in as-is', async function (assert) {
            const alias = { renamed: { name: 'aliased service' } };
            this.engineBase = { dependencies: { services: ['store', alias] } };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.dependencies.services.renamed, alias.renamed);
            assert.strictEqual(instance.dependencies.services.store, this.services['service:store'], 'alongside the resolved ones');
        });

        test('external routes become a self-referencing map', async function (assert) {
            this.engineBase = { dependencies: { externalRoutes: ['console', 'console.home'] } };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(instance.dependencies.externalRoutes, { console: 'console', 'console.home': 'console.home' });
        });

        test('an object external route is merged in as-is', async function (assert) {
            this.engineBase = { dependencies: { externalRoutes: [{ login: 'auth.login' }] } };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(instance.dependencies.externalRoutes, { login: 'auth.login' });
        });

        test('dependencies with neither list still come back with both keys', async function (assert) {
            this.engineBase = { dependencies: {} };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(instance.dependencies, { services: {}, externalRoutes: {} });
        });

        test('an engine with no base is left alone', async function (assert) {
            this.engineBase = undefined;

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.dependencies, undefined);
        });
    });

    module('the mount point the patch corrects', function () {
        test('the trailing dot is stripped before it reaches the instance', async function (assert) {
            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.mountPoint, 'console.fleetops', 'no trailing dot');
        });
    });

    module('registering into every loaded engine', function () {
        test('a service goes into each one and the names are returned', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/a-engine');
            await this.service.ensureEngineLoaded('@fleetbase/b-engine');
            class DispatchService extends Service {}

            const succeeded = this.service.registerServiceIntoAllEngines('dispatch', DispatchService);

            assert.deepEqual(succeeded, ['@fleetbase/a-engine', '@fleetbase/b-engine']);
            assert.deepEqual(
                this.built.map((instance) => instance.registrations.map((r) => r.fullName)),
                [['service:dispatch'], ['service:dispatch']]
            );
        });

        test('a component goes into each one too', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/a-engine');
            class OrderCard {}

            const succeeded = this.service.registerComponentIntoAllEngines('order-card', OrderCard);

            assert.deepEqual(succeeded, ['@fleetbase/a-engine']);
            assert.deepEqual(
                this.built[0].registrations.map((r) => r.fullName),
                ['component:order-card']
            );
        });

        test('with no engines loaded nothing is registered', function (assert) {
            assert.deepEqual(this.service.registerServiceIntoAllEngines('dispatch', class {}), []);
            assert.deepEqual(this.service.registerComponentIntoAllEngines('order-card', class {}), []);
        });
    });

    module('dependencies and registrations that come up short', function () {
        test('a base with no dependencies of its own still gets an object', async function (assert) {
            this.engineBase = {};

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(instance.dependencies, { services: {}, externalRoutes: {} }, 'the missing dependencies default to an empty set');
        });

        test('a hostRouter the application cannot resolve is left as the name', async function (assert) {
            this.services = {};
            this.engineBase = { dependencies: { services: ['hostRouter'] } };

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.dependencies.services.hostRouter, 'hostRouter', 'the engine gets the name to resolve itself');
        });

        test('an engine that rejects the registration is left out of the result', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/a-engine');
            this.built[0].register = () => {
                throw new Error('sealed');
            };

            assert.deepEqual(this.service.registerComponentIntoAllEngines('order-card', class {}), [], 'a failure is reported by omission');
        });
    });
});

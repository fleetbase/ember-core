import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * The engine-facing half of the universe facade: reaching into a loaded engine
 * for one of its services, and registering a component into an engine.
 *
 * Neither needs a real engine — `getEngineInstance` and `ensureEngineLoaded`
 * both come from the extension manager, so a stub standing in for the engine is
 * enough to pin what the facade does with what it gets back.
 */
module('Unit | Service | universe (engine services)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.engineInstance = null;
        this.requestedEngines = [];
        this.watched = [];
        this.registeredHelpers = [];
        this.hookRegistry = { 'order:created': [] };
        const testContext = this;

        this.owner.register(
            'service:universe/extension-manager',
            class extends Service {
                getEngineInstance(engineName) {
                    testContext.requestedEngines.push(engineName);
                    return testContext.engineInstance;
                }
                ensureEngineLoaded(engineName) {
                    testContext.requestedEngines.push(engineName);
                    return Promise.resolve(testContext.engineInstance);
                }
                whenEngineLoaded(engineName, callback) {
                    testContext.watched.push({ engineName, callback });
                    return 'watching';
                }
                setApplicationInstance() {}
            }
        );

        this.owner.register(
            'service:universe/hook-service',
            class extends Service {
                get hooks() {
                    return testContext.hookRegistry;
                }
                setApplicationInstance() {}
            }
        );

        this.owner.register(
            'service:universe/registry-service',
            class extends Service {
                registerHelper(...args) {
                    testContext.registeredHelpers.push(args);
                    return Promise.resolve('registered');
                }
                setApplicationInstance() {}
            }
        );

        for (const name of ['universe/menu-service', 'universe/widget-service', 'router', 'intl', 'url-search-params']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:universe');

        // A stand-in for a loaded engine instance: the facade only ever calls
        // `lookup` and `register` on it.
        this.fakeEngine = (services = {}) => {
            const registered = [];
            this.registeredInEngine = registered;
            return {
                lookup: (fullName) => services[fullName],
                register: (fullName, factory) => registered.push({ fullName, factory }),
            };
        };
    });

    module('getServiceFromEngine', function () {
        test('it looks the service up inside the engine', function (assert) {
            const orders = { name: 'orders service' };
            this.engineInstance = this.fakeEngine({ 'service:orders': orders });

            assert.strictEqual(this.service.getServiceFromEngine('@fleetbase/fleetops-engine', 'orders'), orders);
            assert.deepEqual(this.requestedEngines, ['@fleetbase/fleetops-engine']);
        });

        test('it injects the requested properties onto the service', function (assert) {
            const orders = {};
            this.engineInstance = this.fakeEngine({ 'service:orders': orders });

            const resolved = this.service.getServiceFromEngine('e', 'orders', { inject: { currentUser: 'user-1', store: 'the store' } });

            assert.strictEqual(resolved.currentUser, 'user-1');
            assert.strictEqual(resolved.store, 'the store');
        });

        test('an empty inject list leaves the service untouched', function (assert) {
            const orders = { existing: true };
            this.engineInstance = this.fakeEngine({ 'service:orders': orders });

            const resolved = this.service.getServiceFromEngine('e', 'orders', { inject: {} });

            assert.deepEqual(Object.keys(resolved), ['existing']);
        });

        test('an engine that is not loaded yields null', function (assert) {
            this.engineInstance = null;

            assert.strictEqual(this.service.getServiceFromEngine('e', 'orders'), null);
        });

        test('a non-string service name yields null without touching the engine', function (assert) {
            this.engineInstance = this.fakeEngine({});

            assert.strictEqual(this.service.getServiceFromEngine('e', null), null);
            assert.strictEqual(this.service.getServiceFromEngine('e', { name: 'orders' }), null);
        });

        test('a service the engine does not have comes back undefined, not null', function (assert) {
            this.engineInstance = this.fakeEngine({});

            assert.strictEqual(this.service.getServiceFromEngine('e', 'missing'), undefined, 'the null return is reserved for an unloaded engine');
        });
    });

    module('registerComponentInEngine', function () {
        test('it registers the component under its own name and a dasherized one', async function (assert) {
            class OrderStatusCard {}
            this.engineInstance = this.fakeEngine();

            await this.service.registerComponentInEngine('@fleetbase/fleetops-engine', OrderStatusCard);

            assert.deepEqual(
                this.registeredInEngine.map((entry) => entry.fullName),
                ['component:OrderStatusCard', 'component:order-status-card']
            );
            assert.strictEqual(this.registeredInEngine[0].factory, OrderStatusCard);
        });

        test('a single-word name dasherizes to itself', async function (assert) {
            class Card {}
            this.engineInstance = this.fakeEngine();

            await this.service.registerComponentInEngine('e', Card);

            assert.deepEqual(
                this.registeredInEngine.map((entry) => entry.fullName),
                ['component:Card', 'component:card']
            );
        });

        test('registerAs adds a third name', async function (assert) {
            class OrderCard {}
            this.engineInstance = this.fakeEngine();

            await this.service.registerComponentInEngine('e', OrderCard, { registerAs: 'fleet-ops-order-card' });

            assert.deepEqual(
                this.registeredInEngine.map((entry) => entry.fullName),
                ['component:OrderCard', 'component:order-card', 'component:fleet-ops-order-card']
            );
        });

        test('it waits for the engine to load first', async function (assert) {
            class Card {}
            this.engineInstance = this.fakeEngine();

            await this.service.registerComponentInEngine('@fleetbase/storefront-engine', Card);

            assert.deepEqual(this.requestedEngines, ['@fleetbase/storefront-engine']);
        });

        test('an engine that will not load registers nothing', async function (assert) {
            class Card {}
            this.engineInstance = null;

            await this.service.registerComponentInEngine('e', Card);

            assert.strictEqual(this.registeredInEngine, undefined, 'no engine, no registrations');
        });

        test('a component with no usable name registers nothing', async function (assert) {
            this.engineInstance = this.fakeEngine();

            await this.service.registerComponentInEngine('e', { name: 42 });
            await this.service.registerComponentInEngine('e', {});
            await this.service.registerComponentInEngine('e', null);

            assert.deepEqual(this.registeredInEngine, []);
        });
    });

    module('the remaining engine facades', function () {
        test('whenEngineLoaded forwards to the extension manager and returns its result', function (assert) {
            const callback = () => {};

            const result = this.service.whenEngineLoaded('@fleetbase/fleetops-engine', callback);

            assert.strictEqual(result, 'watching');
            assert.deepEqual(this.watched, [{ engineName: '@fleetbase/fleetops-engine', callback }]);
        });

        test('hooks reads through to the hook service', function (assert) {
            assert.strictEqual(this.service.hooks, this.hookRegistry);
        });

        test('registerHelper forwards to the registry service and resolves with its result', async function (assert) {
            const helper = () => {};

            const result = await this.service.registerHelper('format-distance', helper, { instantiate: false });

            assert.strictEqual(result, 'registered');
            assert.deepEqual(this.registeredHelpers, [['format-distance', helper, { instantiate: false }]]);
        });

        test('registerHelper defaults its options', async function (assert) {
            const helper = () => {};

            await this.service.registerHelper('format-distance', helper);

            assert.deepEqual(this.registeredHelpers[0][2], {});
        });
    });
});

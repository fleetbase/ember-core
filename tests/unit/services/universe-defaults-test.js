import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { set } from '@ember/object';

/**
 * The paths the facade takes when its callers leave the optional arguments off,
 * and when the things it forwards to are not there.
 *
 * Every register* method declares `options = {}` (and several a `route = null`
 * or `items = []`), but the existing tests always pass them, so the defaults
 * themselves were never exercised.
 */
function recordingService(calls, name) {
    return class extends Service {
        constructor() {
            super(...arguments);
            return new Proxy(this, {
                get(target, prop) {
                    if (prop in target) {
                        return target[prop];
                    }
                    if (typeof prop !== 'string') {
                        return undefined;
                    }
                    return (...args) => {
                        calls.push({ service: name, method: prop, args });
                        return `result:${name}.${prop}`;
                    };
                },
            });
        }
    };
}

module('Unit | Service | universe (defaults and fallbacks)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.calls = [];

        for (const [key, name] of [
            ['universe/registry-service', 'registry'],
            ['universe/menu-service', 'menu'],
            ['universe/widget-service', 'widget'],
            ['universe/hook-service', 'hook'],
            ['universe/extension-manager', 'extension'],
        ]) {
            this.owner.register(`service:${key}`, recordingService(this.calls, name));
        }

        for (const name of ['router', 'intl', 'url-search-params']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:universe');
        this.argsOf = (method) => this.calls.find((call) => call.method === method)?.args;
    });

    module('the application cascade', function () {
        test('it reaches all five sub-services', function (assert) {
            const application = { name: 'app' };

            this.service.setApplicationInstance(application);

            assert.deepEqual(
                this.calls.filter((call) => call.method === 'setApplicationInstance').map((call) => call.service),
                ['registry', 'extension', 'menu', 'widget', 'hook']
            );
        });

        test('a sub-service that is not there is skipped rather than throwing', function (assert) {
            // UniverseService is a classic class — `Service.extend(Evented)` — so
            // `set` is what reaches an injected property.
            set(this.service, 'registryService', null);
            set(this.service, 'hookService', null);

            this.service.setApplicationInstance({ name: 'app' });

            assert.deepEqual(
                this.calls.filter((call) => call.method === 'setApplicationInstance').map((call) => call.service),
                ['extension', 'menu', 'widget'],
                'the other three still receive it'
            );
        });

        test('the instance is kept and readable', function (assert) {
            const application = { name: 'app' };

            this.service.setApplicationInstance(application);

            assert.strictEqual(this.service.getApplicationInstance(), application);
        });
    });

    module('getService with a namespaced name', function () {
        test('a name already under universe/ is used as given', function (assert) {
            assert.strictEqual(this.service.getService('universe/menu-service'), this.owner.lookup('service:universe/menu-service'));
        });

        test('a slashed name outside universe/ is looked up verbatim', function (assert) {
            this.owner.register('service:fleet-ops/dispatch', class extends Service {});

            assert.strictEqual(this.service.getService('fleet-ops/dispatch'), this.owner.lookup('service:fleet-ops/dispatch'));
        });
    });

    module('optional arguments left off', function () {
        test('registerExtension defaults its metadata', function (assert) {
            this.service.registerExtension('@fleetbase/fleetops-engine');

            assert.deepEqual(this.argsOf('registerExtension'), ['@fleetbase/fleetops-engine', {}]);
        });

        test('registerComponent defaults its options', function (assert) {
            class Thing {}
            this.service.registerComponent('thing', Thing);

            assert.deepEqual(this.argsOf('registerComponent'), ['thing', Thing, {}]);
        });

        test('registerHeaderMenuItem defaults both route and options', function (assert) {
            this.service.registerHeaderMenuItem('Orders');

            assert.deepEqual(this.argsOf('registerHeaderMenuItem'), ['Orders', null, {}]);
        });

        test('registerOrganizationMenuItem defaults its options', function (assert) {
            this.service.registerOrganizationMenuItem('Billing');

            assert.deepEqual(this.argsOf('registerOrganizationMenuItem'), ['Billing', {}]);
        });

        test('registerAdminMenuPanel defaults its items and options', function (assert) {
            this.service.registerAdminMenuPanel('Fleet Ops');

            assert.deepEqual(this.argsOf('registerAdminMenuPanel'), ['Fleet Ops', [], {}]);
        });

        test('registerMenuItem defaults its route options and options', function (assert) {
            this.service.registerMenuItem('engine:fleet-ops', 'Drivers');

            assert.deepEqual(this.argsOf('registerMenuItem'), ['engine:fleet-ops', 'Drivers', {}, {}]);
        });

        test('registerDashboard defaults its options', function (assert) {
            this.service.registerDashboard('console');

            assert.deepEqual(this.argsOf('registerDashboard'), ['console', {}]);
        });

        test('registerDashboardSlot defaults its options', function (assert) {
            this.service.registerDashboardSlot('main');

            assert.deepEqual(this.argsOf('registerDashboardSlot'), ['main', {}]);
        });

        test('registerDashboardForSlot defaults its options', function (assert) {
            this.service.registerDashboardForSlot('main', 'console');

            assert.deepEqual(this.argsOf('registerDashboardForSlot'), ['main', 'console', {}]);
        });

        test('registerHook defaults its handler and options', function (assert) {
            this.service.registerHook('order:created');

            assert.deepEqual(this.argsOf('registerHook'), ['order:created', null, {}]);
        });

        test('registerRenderableComponent defaults its options', function (assert) {
            class Thing {}
            this.service.registerRenderableComponent('slot', Thing);

            assert.deepEqual(this.argsOf('registerRenderableComponent'), ['slot', Thing, {}]);
        });

        test('_createMenuItem defaults its route and options', function (assert) {
            const item = this.service._createMenuItem('Orders');

            assert.strictEqual(item.title, 'Orders');
            assert.strictEqual(item.route, null);
        });
    });
});

/**
 * The `|| A([])` fallbacks on the two registry getters. This needs its own
 * module rather than a nested one: UniverseService is a classic class, so its
 * injections resolve when it is built, and re-registering a sub-service after
 * that throws "Cannot re-register ... as it has already been resolved".
 */
module('Unit | Service | universe (empty registry fallbacks)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register(
            'service:universe/registry-service',
            class extends Service {
                getRegistry() {
                    return null;
                }
            }
        );

        for (const name of ['universe/menu-service', 'universe/widget-service', 'universe/hook-service', 'universe/extension-manager', 'router', 'intl', 'url-search-params']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:universe');
    });

    test('menu items fall back to an empty list', function (assert) {
        assert.deepEqual(this.service.getMenuItemsFromRegistry('engine:fleet-ops').slice(), []);
    });

    test('menu panels fall back to an empty list', function (assert) {
        assert.deepEqual(this.service.getMenuPanelsFromRegistry('engine:fleet-ops').slice(), []);
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * UniverseService is mostly a facade over five sub-services. These tests pin
 * what it adds on top of them: service-name normalization, the application
 * instance cascade, boot callbacks, and the virtual-route transition rules.
 *
 * The methods that only forward to a sub-service are left to that service's own
 * tests; asserting a one-line forward here would restate the implementation
 * rather than any behaviour.
 */
module('Unit | Service | universe', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.applications = [];
        const testContext = this;

        // Only the application cascade is observed on these stubs.
        for (const name of ['menu-service', 'widget-service', 'hook-service', 'registry-service']) {
            this.owner.register(
                `service:universe/${name}`,
                class extends Service {
                    setApplicationInstance(application) {
                        testContext.applications.push({ service: name, application });
                    }
                }
            );
        }

        this.engineHandlers = [];
        this.owner.register(
            'service:universe/extension-manager',
            class extends Service {
                constructor() {
                    super(...arguments);
                    this.finished = 0;
                }
                setApplicationInstance(application) {
                    testContext.applications.push({ service: 'extension-manager', application });
                }
                on(eventName, handler) {
                    testContext.engineHandlers.push({ eventName, handler });
                }
                finishBoot() {
                    this.finished += 1;
                }
            }
        );

        this.transitions = [];
        this.owner.register(
            'service:router',
            class extends Service {
                transitionTo(...args) {
                    testContext.transitions.push(args);
                    return Promise.resolve('transitioned');
                }
            }
        );

        this.restored = [];
        this.owner.register(
            'service:url-search-params',
            class extends Service {
                all() {
                    return { q: 'search' };
                }
                setParamsToCurrentUrl(params) {
                    testContext.restored.push(params);
                }
            }
        );

        this.owner.register('service:intl', class extends Service {});

        this.service = this.owner.lookup('service:universe');
        this.extensionManager = this.owner.lookup('service:universe/extension-manager');
    });

    module('application instance', function () {
        test('it cascades to the sub-services that need it', function (assert) {
            const application = {};

            this.service.setApplicationInstance(application);

            assert.deepEqual(
                this.applications.map((a) => a.service).sort(),
                ['extension-manager', 'menu-service', 'registry-service'],
                'the widget and hook services are not part of the cascade'
            );
            assert.strictEqual(this.applications[0].application, application);
        });

        test('it is readable back', function (assert) {
            const application = {};

            this.service.setApplicationInstance(application);

            assert.strictEqual(this.service.getApplicationInstance(), application);
            assert.strictEqual(this.service.applicationInstance, application);
        });

        test('the initial location is captured at construction', function (assert) {
            assert.strictEqual(this.service.initialLocation.pathname, window.location.pathname);
        });
    });

    module('getService name normalization', function () {
        test('short names map onto the sub-services', function (assert) {
            assert.strictEqual(this.service.getService('hook'), this.owner.lookup('service:universe/hook-service'));
            assert.strictEqual(this.service.getService('hooks'), this.owner.lookup('service:universe/hook-service'));
            assert.strictEqual(this.service.getService('menu'), this.owner.lookup('service:universe/menu-service'));
            assert.strictEqual(this.service.getService('widget'), this.owner.lookup('service:universe/widget-service'));
            assert.strictEqual(this.service.getService('widgets'), this.owner.lookup('service:universe/widget-service'));
            assert.strictEqual(this.service.getService('registry'), this.owner.lookup('service:universe/registry-service'));
        });

        test('full names work too', function (assert) {
            assert.strictEqual(this.service.getService('hook-service'), this.owner.lookup('service:universe/hook-service'));
        });

        test('a camelCase name is kebab-cased', function (assert) {
            assert.strictEqual(this.service.getService('hookService'), this.owner.lookup('service:universe/hook-service'));
        });

        test('a name already carrying the universe prefix is used as-is', function (assert) {
            assert.strictEqual(this.service.getService('universe/menu-service'), this.owner.lookup('service:universe/menu-service'));
        });

        test('an unmapped name is still scoped under universe/', function (assert) {
            assert.strictEqual(this.service.getService('nothing-here'), undefined, 'it does not fall back to a top-level service');
        });
    });

    module('boot callbacks', function () {
        test('a callback is registered and run with the service', async function (assert) {
            const seen = [];
            this.service.onBoot((universe) => seen.push(universe));

            await this.service.executeBootCallbacks();

            assert.deepEqual(seen, [this.service]);
        });

        test('callbacks run in registration order', async function (assert) {
            const order = [];
            this.service.onBoot(() => order.push('first'));
            this.service.onBoot(() => order.push('second'));

            await this.service.executeBootCallbacks();

            assert.deepEqual(order, ['first', 'second']);
        });

        test('an async callback is awaited', async function (assert) {
            const order = [];
            this.service.onBoot(async () => {
                await Promise.resolve();
                order.push('async');
            });
            this.service.onBoot(() => order.push('sync'));

            await this.service.executeBootCallbacks();

            assert.deepEqual(order, ['async', 'sync'], 'the second waits for the first');
        });

        test('a non-function is ignored', async function (assert) {
            this.service.onBoot('not a function');
            this.service.onBoot(null);

            assert.strictEqual(this.service.bootCallbacks.length, 0);
        });

        test('a throwing callback does not stop the others', async function (assert) {
            const seen = [];
            this.service.onBoot(() => {
                throw new Error('boom');
            });
            this.service.onBoot(() => seen.push('survived'));

            await this.service.executeBootCallbacks();

            assert.deepEqual(seen, ['survived']);
        });

        test('boot is marked finished afterwards', async function (assert) {
            await this.service.executeBootCallbacks();

            assert.strictEqual(this.extensionManager.finished, 1);
        });

        test('a throwing callback still lets boot finish', async function (assert) {
            this.service.onBoot(() => {
                throw new Error('boom');
            });

            await this.service.executeBootCallbacks();

            assert.strictEqual(this.extensionManager.finished, 1);
        });
    });

    module('transitions', function () {
        test('slug only', function (assert) {
            this.service.transitionMenuItem('console.route', { slug: 'orders' });

            assert.deepEqual(this.transitions, [['console.route', 'orders']]);
        });

        test('slug and view', function (assert) {
            this.service.transitionMenuItem('console.route', { slug: 'orders', view: 'list' });

            assert.deepEqual(this.transitions, [['console.route', 'orders', { queryParams: { view: 'list' } }]]);
        });

        test('section and slug', function (assert) {
            this.service.transitionMenuItem('console.route', { section: 'ops', slug: 'orders' });

            assert.deepEqual(this.transitions, [['console.route', 'ops', 'orders']]);
        });

        test('section, slug and view', function (assert) {
            this.service.transitionMenuItem('console.route', { section: 'ops', slug: 'orders', view: 'list' });

            assert.deepEqual(this.transitions, [['console.route', 'ops', 'orders', { queryParams: { view: 'list' } }]]);
        });

        test('a section without a slug falls through to the slug-only form', function (assert) {
            this.service.transitionMenuItem('console.route', { section: 'ops' });

            assert.deepEqual(this.transitions, [['console.route', undefined]], 'section alone is not enough to route');
        });
    });

    module('virtual routes', function () {
        test('the view is read off the transition', function (assert) {
            assert.strictEqual(this.service.getViewFromTransition({ to: { queryParams: { view: 'list' } } }), 'list');
        });

        test('a transition with no query params yields no view', function (assert) {
            assert.strictEqual(this.service.getViewFromTransition({ to: {} }), undefined);
            assert.strictEqual(this.service.getViewFromTransition({}), null);
        });

        test('a redirect only happens on a fresh entry into the app', async function (assert) {
            this.service.lookupMenuItemFromRegistry = () => ({ slug: 'orders' });

            await this.service.virtualRouteRedirect({ to: {}, from: { name: 'somewhere' } }, 'registry', 'console.route');

            assert.deepEqual(this.transitions, [], 'an in-app transition is left alone');
        });

        test('nothing happens when no menu item matches', async function (assert) {
            this.service.lookupMenuItemFromRegistry = () => null;

            await this.service.virtualRouteRedirect({ to: {}, from: null }, 'registry', 'console.route');

            assert.deepEqual(this.transitions, []);
        });

        test('a matching item on a fresh entry transitions', async function (assert) {
            this.service.lookupMenuItemFromRegistry = () => ({ slug: 'orders', view: 'list' });

            await this.service.virtualRouteRedirect({ to: {}, from: null }, 'registry', 'console.route');

            assert.deepEqual(this.transitions, [['console.route', 'orders', { queryParams: { view: 'list' } }]]);
        });

        test('query params are only written back when asked for', async function (assert) {
            this.service.lookupMenuItemFromRegistry = () => ({ slug: 'orders' });

            await this.service.virtualRouteRedirect({ to: {}, from: null }, 'registry', 'console.route');
            assert.deepEqual(this.restored, [], 'not restored by default');

            await this.service.virtualRouteRedirect({ to: {}, from: null }, 'registry', 'console.route', { restoreQueryParams: true });
            assert.deepEqual(this.restored, [{ q: 'search' }]);
        });

        test('the query params gathered for the redirect never reach the transition', async function (assert) {
            // Pinned, not fixed. virtualRouteRedirect reads the current query
            // params and passes them as a third argument to transitionMenuItem,
            // but that method's signature is (route, menuItem) — the third
            // argument is silently dropped. Only `restoreQueryParams` puts them
            // back, and it does so by rewriting the URL afterwards.
            this.service.lookupMenuItemFromRegistry = () => ({ slug: 'orders' });

            await this.service.virtualRouteRedirect({ to: {}, from: null }, 'registry', 'console.route');

            assert.deepEqual(this.transitions, [['console.route', 'orders']], 'no queryParams argument is forwarded');
        });
    });

    module('events', function () {
        test('a registry event is namespaced by registry name', function (assert) {
            const seen = [];
            this.service.on('my-registry:changed', (...args) => seen.push(args));

            this.service.createRegistryEvent('my-registry', 'changed', 'a', 2);

            assert.deepEqual(seen, [['a', 2]]);
        });

        test('onEngineLoaded only fires for the named engine', function (assert) {
            const seen = [];
            this.service.onEngineLoaded('@fleetbase/fleetops-engine', (instance) => seen.push(instance));

            const [{ eventName, handler }] = this.engineHandlers;
            assert.strictEqual(eventName, 'engine.loaded');

            handler('@fleetbase/other-engine', { other: true });
            assert.deepEqual(seen, [], 'a different engine is ignored');

            handler('@fleetbase/fleetops-engine', { fleetops: true });
            assert.deepEqual(seen, [{ fleetops: true }]);
        });
    });

    module('_createMenuItem', function () {
        test('it builds a plain object from a title and route', function (assert) {
            const item = this.service._createMenuItem('Orders', 'console.orders');

            assert.strictEqual(item.title, 'Orders');
            assert.strictEqual(item.route, 'console.orders');
            assert.strictEqual(item.slug, 'orders');
        });

        test('options are applied', function (assert) {
            const item = this.service._createMenuItem('Orders', 'console.orders', {
                icon: 'box',
                slug: 'custom',
                section: 'ops',
                priority: 3,
                type: 'link',
                wrapperClass: 'wrap',
                queryParams: { view: 'list' },
            });

            assert.strictEqual(item.icon, 'box');
            assert.strictEqual(item.slug, 'custom');
            assert.strictEqual(item.section, 'ops');
            assert.strictEqual(item.priority, 3);
            assert.strictEqual(item.type, 'link');
            assert.strictEqual(item.wrapperClass, 'wrap');
            assert.deepEqual(item.queryParams, { view: 'list' });
        });

        test('an onClick option throws, exactly as it does in the menu service', function (assert) {
            // Same root cause: MenuItem's constructor assigns `this.onClick = null`,
            // shadowing its own `onClick(handler)` chaining method.
            assert.throws(() => this.service._createMenuItem('Orders', 'r', { onClick: () => {} }), /not a function/);
        });
    });
});

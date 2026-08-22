import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import EmberObject from '@ember/object';

/**
 * The half of FiltersService the sibling test does not reach: clearing, the
 * reset paths, and the route-lookup helpers.
 *
 * `clear` is the interesting one. It is declared `clear(callback, queryParam)`
 * but detects reversed arguments and swaps them, so `clear('status')` and
 * `clear(fn, 'status')` both work — the tests below pin each entry into that
 * recursion separately.
 *
 * Every path that does not take a controller reads the active route through the
 * private router microlib, so a stand-in is registered as `router:main`.
 */
module('Unit | Service | filters (clearing and lookups)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.searchParams = {};
        this.transitions = [];
        const testContext = this;

        this.owner.register(
            'service:url-search-params',
            class extends Service {
                get(key) {
                    return testContext.searchParams[key];
                }
            }
        );

        this.owner.register(
            'service:router',
            class extends Service {
                transitionTo(...args) {
                    testContext.transitions.push(args);
                }
            }
        );

        this.service = this.owner.lookup('service:filters');

        this.useCurrentRoute = ({ controller = null, queryParams = {}, url = {} } = {}) => {
            this.searchParams = url;
            const route = { controller, queryParams };
            this.owner.register('router:main', { _routerMicrolib: { currentRouteInfos: [{ _route: route }] } }, { instantiate: false });
            return route;
        };
    });

    module('clear', function () {
        test('a single query param name is cleared', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null } });
            this.service.set('status', 'active');

            this.service.clear('status');

            assert.strictEqual(this.service.pendingQueryParams.status, undefined);
        });

        test('a list of names clears each of them', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null, type: null } });
            this.service.set('status', 'active');
            this.service.set('type', 'delivery');

            this.service.clear(['status', 'type']);

            assert.strictEqual(this.service.pendingQueryParams.status, undefined);
            assert.strictEqual(this.service.pendingQueryParams.type, undefined);
        });

        test('no name at all clears every active param', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null, type: null }, url: { status: 'active', type: 'delivery' } });
            this.service.set('status', 'active');
            this.service.set('type', 'delivery');

            this.service.clear();

            assert.strictEqual(this.service.pendingQueryParams.status, undefined);
            assert.strictEqual(this.service.pendingQueryParams.type, undefined);
        });

        test('a callback is invoked once per cleared param', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null, type: null }, url: { status: 'active', type: 'delivery' } });
            const cleared = [];

            this.service.clear((queryParam) => cleared.push(queryParam));

            assert.deepEqual(cleared.sort(), ['status', 'type']);
        });

        test('the arguments may be given in either order', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null } });
            const cleared = [];

            this.service.clear((queryParam) => cleared.push(queryParam), 'status');
            this.service.clear('status', (queryParam) => cleared.push(queryParam));

            assert.deepEqual(cleared, ['status', 'status'], 'callback-first and name-first both reach the callback');
        });

        test('clearing leaves the key in place holding undefined', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null } });
            this.service.set('status', 'active');

            this.service.clear('status');

            assert.true('status' in this.service.pendingQueryParams, 'so apply() still writes the cleared value onto the controller');
        });

        test('clearing when nothing is filtered is harmless', function (assert) {
            this.useCurrentRoute({ queryParams: {} });

            this.service.clear();

            assert.deepEqual(this.service.pendingQueryParams, {});
        });
    });

    module('mutate', function () {
        test('it sets and applies in one step', function (assert) {
            const controller = EmberObject.create({ queryParams: ['status'], status: null, page: 4 });

            this.service.mutate('status', 'active', controller);

            assert.strictEqual(controller.status, 'active');
            assert.strictEqual(controller.page, 1);
        });

        test('it serialises on the way in', function (assert) {
            const controller = EmberObject.create({ queryParams: ['status'], status: null, page: 1 });

            this.service.mutate('status', ['active', 'pending'], controller);

            assert.strictEqual(controller.status, 'active,pending');
        });
    });

    module('removeFromController', function () {
        test('it clears the value on the controller and in the pending set', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null } });
            const controller = EmberObject.create({ queryParams: ['status'], status: 'active', page: 1 });
            this.service.set('status', 'active');

            this.service.removeFromController(controller, 'status', undefined);

            assert.strictEqual(controller.status, undefined);
            assert.strictEqual(this.service.pendingQueryParams.status, undefined);
        });

        test('a replacement value is written rather than cleared', function (assert) {
            const controller = EmberObject.create({ queryParams: ['status'], status: 'active', page: 1 });

            this.service.removeFromController(controller, 'status', 'archived');

            assert.strictEqual(controller.status, 'archived');
            assert.strictEqual(this.service.pendingQueryParams.status, 'archived');
        });
    });

    module('reset', function () {
        test('it clears every unmanaged param on the controller', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null, type: null } });
            const controller = EmberObject.create({ queryParams: ['status', 'type', 'page'], status: 'active', type: 'delivery', page: 3 });

            this.service.reset(controller);

            assert.strictEqual(controller.status, undefined);
            assert.strictEqual(controller.type, undefined);
            assert.strictEqual(controller.page, 3, 'managed params are left alone');
        });
    });

    module('resetQueryParams', function () {
        test('it clears the filters and transitions to a bare url', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null }, url: { status: 'active' } });

            this.service.resetQueryParams();

            assert.deepEqual(this.transitions, [[{ queryParams: {} }]]);
        });

        test('it does nothing when nothing is filtered', function (assert) {
            this.useCurrentRoute({ queryParams: {} });

            this.service.resetQueryParams();

            assert.deepEqual(this.transitions, [], 'no pointless transition');
        });
    });

    module('route lookups', function () {
        test('lookupCurrentRoute returns the deepest resolved route', function (assert) {
            const route = this.useCurrentRoute({ queryParams: { status: null } });

            assert.strictEqual(this.service.lookupCurrentRoute(), route);
        });

        test('lookupCurrentController returns that route controller', function (assert) {
            const controller = EmberObject.create({ queryParams: [] });
            this.useCurrentRoute({ controller });

            assert.strictEqual(this.service.lookupCurrentController(), controller);
        });

        test('getRouteQueryParams returns the declared query params', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null, type: null } });

            assert.deepEqual(this.service.getRouteQueryParams(), { status: null, type: null });
        });
    });

    module('getQueryParams and Ember mapped query params', function () {
        test('a controller declaring a mapped query param is not understood', function (assert) {
            // Pinned, not fixed. Ember lets a controller rename a query param with
            // an object entry — `queryParams: ['status', { category: 'cat' }]` — and
            // that is the documented way to give a property a different name in the
            // url. getQueryParams walks the array and hands each entry straight to
            // `get(controller, qp)`, which requires a string or number. The object
            // entry therefore fails the assertion rather than being unwrapped, so
            // any controller using the mapped form cannot be filtered at all.
            const controller = EmberObject.create({ queryParams: ['status', { category: 'cat' }], status: 'active', category: 'boxes' });

            assert.throws(() => this.service.getQueryParams(controller), /must be a string or number/);
        });

        test('the plain string form is handled', function (assert) {
            const controller = EmberObject.create({ queryParams: ['status'], status: 'active' });

            assert.deepEqual(this.service.getQueryParams(controller), { status: 'active' });
        });
    });

    module('set from a DOM event', function () {
        test('an InputEvent contributes its target value', async function (assert) {
            const input = document.createElement('input');
            document.body.appendChild(input);

            try {
                input.value = 'search text';
                input.addEventListener('input', (event) => this.service.set('query', event));
                input.dispatchEvent(new InputEvent('input', { bubbles: true }));

                assert.strictEqual(this.service.pendingQueryParams.query, 'search text');
            } finally {
                input.remove();
            }
        });
    });
});

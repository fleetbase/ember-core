import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import EmberObject from '@ember/object';

module('Unit | Service | filters', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.searchParams = {};
        const testContext = this;

        this.owner.register(
            'service:url-search-params',
            class extends Service {
                get(key) {
                    return testContext.searchParams[key];
                }
            }
        );

        this.service = this.owner.lookup('service:filters');

        // The service reaches the active route through the private router microlib,
        // so tests that exercise those paths install a minimal stand-in. Without a
        // controller argument the service reads the route's declared query params
        // and takes their values from the url, which is what `searchParams` feeds.
        this.useCurrentRoute = ({ controller = null, queryParams = {}, url = {} } = {}) => {
            this.searchParams = url;
            const route = { controller, queryParams };
            this.owner.register('router:main', { _routerMicrolib: { currentRouteInfos: [{ _route: route }] } }, { instantiate: false });
            return route;
        };
    });

    module('serializeQueryParamValue', function () {
        test('it formats a date', function (assert) {
            const value = this.service.serializeQueryParamValue('created_at', new Date(2026, 0, 15, 9, 30));

            assert.strictEqual(value, '2026-01-15 09:30');
        });

        test('it joins an array into a comma separated string', function (assert) {
            assert.strictEqual(this.service.serializeQueryParamValue('status', ['active', 'pending']), 'active,pending');
        });

        test('it drops blank entries from an array', function (assert) {
            assert.strictEqual(this.service.serializeQueryParamValue('status', ['active', '', null, 'pending']), 'active,pending');
        });

        test('it serialises dates inside an array', function (assert) {
            const value = this.service.serializeQueryParamValue('range', [new Date(2026, 0, 1, 0, 0), new Date(2026, 0, 2, 0, 0)]);

            assert.strictEqual(value, '2026-01-01 00:00,2026-01-02 00:00');
        });

        test('it passes other values through untouched', function (assert) {
            assert.strictEqual(this.service.serializeQueryParamValue('q', 'text'), 'text');
            assert.strictEqual(this.service.serializeQueryParamValue('n', 5), 5);
        });
    });

    module('set', function () {
        test('it stores a pending value', function (assert) {
            this.service.set('status', 'active');

            assert.deepEqual(this.service.pendingQueryParams, { status: 'active' });
        });

        test('it accumulates across calls', function (assert) {
            this.service.set('status', 'active');
            this.service.set('type', 'delivery');

            assert.deepEqual(this.service.pendingQueryParams, { status: 'active', type: 'delivery' });
        });

        test('status all is treated as no filter', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null } });

            this.service.set('status', 'active');
            this.service.set('status', 'all');

            assert.notOk(this.service.pendingQueryParams.status, 'the status filter is cleared');
        });

        test('a blank value clears rather than stores', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null } });

            this.service.set('status', 'active');
            this.service.set('status', '');

            assert.notOk(this.service.pendingQueryParams.status);
        });

        test('it serialises the value on the way in', function (assert) {
            this.service.set('status', ['active', 'pending']);

            assert.strictEqual(this.service.pendingQueryParams.status, 'active,pending');
        });
    });

    module('apply', function () {
        test('it writes the pending params onto the controller and resets the page', function (assert) {
            const controller = EmberObject.create({ queryParams: ['status'], status: null, page: 5 });

            this.service.set('status', 'active');
            this.service.apply(controller);

            assert.strictEqual(controller.status, 'active');
            assert.strictEqual(controller.page, 1, 'pagination returns to the first page');
        });

        test('existing controller values survive when nothing overrides them', function (assert) {
            const controller = EmberObject.create({ queryParams: ['status', 'type'], status: 'active', type: 'delivery', page: 2 });

            this.service.apply(controller);

            assert.strictEqual(controller.status, 'active');
            assert.strictEqual(controller.type, 'delivery');
        });

        test('a pending value overrides the controller value', function (assert) {
            const controller = EmberObject.create({ queryParams: ['status'], status: 'active', page: 1 });

            this.service.set('status', 'archived');
            this.service.apply(controller);

            assert.strictEqual(controller.status, 'archived');
        });
    });

    module('getQueryParams', function () {
        test('it reads the controller query params, skipping managed ones', function (assert) {
            const controller = EmberObject.create({
                queryParams: ['status', 'page', 'limit'],
                status: 'active',
                page: 3,
                limit: 25,
            });

            const params = this.service.getQueryParams(controller);

            assert.deepEqual(params, { status: 'active' }, 'page and limit are managed and excluded');
        });

        test('it returns an empty object when the controller has no query params', function (assert) {
            assert.deepEqual(this.service.getQueryParams(EmberObject.create({ queryParams: [] })), {});
        });
    });

    module('activeFilters', function () {
        test('it lists the active filters with a label', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null, type: null }, url: { status: 'active', type: 'delivery' } });

            assert.deepEqual(this.service.activeFilters, [
                { queryParam: 'status', label: 'status', value: 'active' },
                { queryParam: 'type', label: 'type', value: 'delivery' },
            ]);
        });

        test('it omits blank and managed params', function (assert) {
            this.useCurrentRoute({ queryParams: { status: null, type: null, page: null }, url: { status: 'active', type: '', page: '2' } });

            assert.deepEqual(this.service.activeFilters, [{ queryParam: 'status', label: 'status', value: 'active' }]);
        });

        test('it is empty when nothing is filtered', function (assert) {
            this.useCurrentRoute({ queryParams: {} });

            assert.deepEqual(this.service.activeFilters, []);
        });
    });
});

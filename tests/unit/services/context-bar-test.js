import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
import { settled } from '@ember/test-helpers';
import { CHIP_TONES, ROOT_ROUTES, humanizeRouteSegment } from '@fleetbase/ember-core/services/context-bar';

/**
 * The context bar holds crumbs and chips. Defaults come from the router's
 * current route chain, labelled from registered menu items; anything a page
 * sets is dropped on the next transition unless that transition's route set it.
 */
class RouterStub extends Service.extend(Evented) {
    @tracked currentRoute = null;
}

class UniverseStub extends Service {
    headerMenuItems = [
        { route: 'console.fleet-ops', title: 'Fleet-Ops' },
        { route: 'console.fleet-ops', title: 'Fleet-Ops duplicate' },
        { route: 'console.fleet-ops.scheduler', title: 'Scheduler', _isShortcut: true },
    ];
    registryService = {
        registries: new Map([
            ['engine:fleet-ops', { 'menu-item': [{ route: 'console.fleet-ops.operations.orders.index', title: 'Orders' }, { title: 'No route' }] }],
            ['console:admin', {}],
            ['broken', null],
        ]),
    };
}

/** Build a RouteInfo-like chain from [name, params] pairs, returning the leaf. */
function chain(...entries) {
    let parent = null;
    for (const [name, params] of entries) {
        parent = { name, params, parent };
    }
    return parent;
}

module('Unit | Service | context-bar', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:router', RouterStub);
        this.owner.register('service:universe', UniverseStub);
        this.router = this.owner.lookup('service:router');
        this.universe = this.owner.lookup('service:universe');
        this.service = this.owner.lookup('service:context-bar');
    });

    test('exports', function (assert) {
        assert.deepEqual(CHIP_TONES, ['info', 'warn', 'ok', 'menu']);
        assert.deepEqual(ROOT_ROUTES, ['application', 'console']);
        assert.strictEqual(humanizeRouteSegment('console.fleet-ops.order-configs'), 'Order Configs');
        assert.strictEqual(humanizeRouteSegment('vehicles_list'), 'Vehicles List');
    });

    module('default crumbs', function () {
        test('no current route gives no crumbs', function (assert) {
            assert.deepEqual(this.service.crumbs, []);
            assert.false(this.service.hasCustomCrumbs);
        });

        test('the route chain becomes crumbs labelled from menu items', function (assert) {
            this.router.currentRoute = chain(
                ['application', {}],
                ['console', {}],
                ['console.fleet-ops', {}],
                ['console.fleet-ops.operations', undefined],
                ['console.fleet-ops.operations.orders', {}],
                ['console.fleet-ops.operations.orders.index', {}]
            );

            assert.deepEqual(this.service.crumbs, [
                { label: 'Fleet-Ops', route: 'console.fleet-ops' },
                { label: 'Operations', route: 'console.fleet-ops.operations' },
                { label: 'Orders', route: 'console.fleet-ops.operations.orders' },
            ]);
        });

        test('dynamic segments are carried as models down the chain; substates are skipped', function (assert) {
            this.router.currentRoute = chain(
                ['console', {}],
                ['console.fleet-ops', {}],
                ['console.fleet-ops.vehicles', {}],
                ['console.fleet-ops.vehicles.details', { public_id: 'vehicle_1' }],
                ['console.fleet-ops.vehicles.details.trips', { trip: 't1' }],
                ['console.fleet-ops.vehicles.details.trips_loading', {}],
                ['console.fleet-ops.vehicles.details.trips.error', {}]
            );

            const crumbs = this.service.crumbs;
            assert.strictEqual(crumbs.length, 4);
            assert.notOk('models' in crumbs[1]);
            assert.deepEqual(crumbs[2], { label: 'Details', route: 'console.fleet-ops.vehicles.details', models: ['vehicle_1'] });
            assert.deepEqual(crumbs[3].models, ['vehicle_1', 't1']);
        });

        test('works without the registry service', function (assert) {
            this.universe.registryService = undefined;
            this.universe.headerMenuItems = undefined;
            this.router.currentRoute = chain(['console.ledger', {}]);
            assert.deepEqual(this.service.crumbs, [{ label: 'Ledger', route: 'console.ledger' }]);
        });
    });

    module('setting crumbs and chips', function () {
        test('setCrumbs overrides the defaults and normalises entries', function (assert) {
            const menu = [{ label: 'Other' }];
            this.service.setCrumbs([
                'Orders',
                { label: 'ORD-1', route: 'console.fleet-ops.orders.details', models: ['o1'], query: { tab: 'x' }, menu, split: true, extra: 1 },
                { route: 'no-label' },
                null,
            ]);

            assert.true(this.service.hasCustomCrumbs);
            assert.deepEqual(this.service.crumbs, [
                { label: 'Orders' },
                { label: 'ORD-1', route: 'console.fleet-ops.orders.details', models: ['o1'], query: { tab: 'x' }, menu, split: true },
            ]);
        });

        test('setCrumbs(null) or a non-array goes back to defaults or empty', function (assert) {
            this.service.setCrumbs(['A']);
            this.service.setCrumbs(null);
            assert.false(this.service.hasCustomCrumbs);

            this.service.setCrumbs('nope');
            assert.deepEqual(this.service.crumbs, []);
            assert.true(this.service.hasCustomCrumbs);

            this.service.setCrumbs();
            assert.false(this.service.hasCustomCrumbs);
        });

        test('setChips normalises tones', function (assert) {
            this.service.setChips(['Live', { label: 'Late', tone: 'warn', count: 3 }, { label: 'Odd', tone: 'purple' }, { tone: 'ok' }, 5]);
            assert.deepEqual(this.service.chips, [
                { label: 'Live', tone: 'info' },
                { label: 'Late', tone: 'warn', count: 3 },
                { label: 'Odd', tone: 'info' },
            ]);
        });

        test('clear resets both', function (assert) {
            this.service.setCrumbs(['A']);
            this.service.setChips(['B']);
            this.service.clear();
            assert.false(this.service.hasCustomCrumbs);
            assert.deepEqual(this.service.chips, []);
        });
    });

    module('route changes', function () {
        test('crumbs and chips set before a transition are cleared when it completes', function (assert) {
            this.service.setCrumbs(['Old']);
            this.service.setChips(['Old']);

            this.router.trigger('routeWillChange', {});
            this.router.trigger('routeDidChange', {});

            assert.false(this.service.hasCustomCrumbs);
            assert.deepEqual(this.service.chips, []);
        });

        test('crumbs and chips set by the new route survive', function (assert) {
            this.service.setCrumbs(['Old']);
            this.router.trigger('routeWillChange', {});
            this.service.setCrumbs(['New']);
            this.service.setChips(['New']);
            this.router.trigger('routeDidChange', {});

            assert.deepEqual(this.service.crumbs, [{ label: 'New' }]);
            assert.deepEqual(this.service.chips, [{ label: 'New', tone: 'info' }]);
        });

        test('only crumbs set by the new route survive when it sets no chips', function (assert) {
            this.service.setChips(['Old']);
            this.router.trigger('routeWillChange', {});
            this.service.setCrumbs(['New']);
            this.router.trigger('routeDidChange', {});

            assert.true(this.service.hasCustomCrumbs);
            assert.deepEqual(this.service.chips, []);
        });

        test('query-param-only transitions keep everything', function (assert) {
            this.service.setCrumbs(['Kept']);
            this.router.trigger('routeWillChange', { queryParamsOnly: true });
            this.router.trigger('routeDidChange', { queryParamsOnly: true });
            this.router.trigger('routeDidChange');

            assert.deepEqual(this.service.crumbs, [{ label: 'Kept' }]);
        });

        test('setting after a transition completes is kept until the next one', function (assert) {
            this.router.trigger('routeWillChange');
            this.router.trigger('routeDidChange');
            this.service.setCrumbs(['Late']);

            assert.true(this.service.hasCustomCrumbs);
        });

        test('listeners are removed on destroy', async function (assert) {
            this.service.destroy();
            await settled();
            assert.false(this.router.has('routeWillChange'));
            assert.false(this.router.has('routeDidChange'));
        });
    });

    test('a router without events is tolerated', async function (assert) {
        this.owner.unregister('service:router');
        this.owner.register('service:router', class extends Service {});
        this.owner.unregister('service:context-bar');
        this.owner.register('service:context-bar', this.service.constructor);

        const service = this.owner.lookup('service:context-bar');
        assert.deepEqual(service.chips, []);
        service.destroy();
        await settled();
        assert.ok(true, 'destroy without listeners does not throw');
    });
});

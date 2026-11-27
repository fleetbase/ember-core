import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
import { destroy } from '@ember/destroyable';
import { settled } from '@ember/test-helpers';
import { MERGED_KEYS, routeMatches, resolveBackdrop } from '@fleetbase/ember-core/services/backdrop';

/**
 * The backdrop service picks the backdrop for the current route, keeps
 * keep-alive backdrops mounted, and holds each owner's layer request until the
 * owner releases it, leaves its route or is destroyed.
 */
class RouterStub extends Service.extend(Evented) {
    @tracked currentRouteName;
}

/** Run a transition on the router stub the way Ember's router reports it. */
function transitionTo(router, name, extra = {}) {
    const transition = { to: { name }, ...extra };
    router.trigger('routeWillChange', transition);
    router.currentRouteName = name;
    router.trigger('routeDidChange', transition);
}

module('Unit | Service | backdrop', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:router', RouterStub);
        this.router = this.owner.lookup('service:router');
        this.universe = this.owner.lookup('service:universe');
        this.universe.registryService.clearList('backdrop', 'registration');
        this.service = this.owner.lookup('service:backdrop');
    });

    module('helpers', function () {
        test('exports', function (assert) {
            assert.deepEqual(MERGED_KEYS, ['fitBounds', 'focus', 'mode']);
        });

        test('routeMatches matches a prefix and its children only', function (assert) {
            assert.true(routeMatches('console.fleet-ops', 'console.fleet-ops'));
            assert.true(routeMatches('console.fleet-ops.operations.orders.index', 'console.fleet-ops'));
            assert.false(routeMatches('console.fleet-opsx', 'console.fleet-ops'), 'a sibling sharing the text is not a child');
            assert.false(routeMatches('console', 'console.fleet-ops'));
            assert.false(routeMatches(null, 'console'));
            assert.false(routeMatches('console', null));
            assert.false(routeMatches('console', ''));
        });

        test('resolveBackdrop: priority, then the most specific prefix, then registration order', function (assert) {
            const broad = { name: 'broad', routes: ['console'], priority: 0 };
            const specific = { name: 'specific', routes: ['console.fleet-ops', 'console.fleet-ops.operations'], priority: 0 };
            const sameLength = { name: 'same-length', routes: ['console.fleet-ops.operations'], priority: 0 };
            const urgent = { name: 'urgent', routes: ['console'], priority: 10 };
            const low = { name: 'low', routes: ['console.fleet-ops.operations.orders'], priority: -1 };

            assert.strictEqual(resolveBackdrop([], 'console'), null);
            assert.strictEqual(resolveBackdrop([specific], 'console.storefront'), null);
            assert.strictEqual(resolveBackdrop([broad, specific], 'console.fleet-ops.operations.orders'), specific, 'longest prefix wins a tie');
            assert.strictEqual(resolveBackdrop([specific, broad], 'console.fleet-ops.operations'), specific, 'a shorter match does not replace it');
            assert.strictEqual(resolveBackdrop([specific, sameLength], 'console.fleet-ops.operations'), specific, 'an equal match keeps the earlier one');
            assert.strictEqual(resolveBackdrop([specific, urgent], 'console.fleet-ops'), urgent, 'higher priority wins');
            assert.strictEqual(resolveBackdrop([broad, low], 'console.fleet-ops.operations.orders'), broad, 'lower priority loses');
        });
    });

    module('active and mounted', function () {
        test('no route or no match means the dot-grid canvas', function (assert) {
            assert.strictEqual(this.service.active, null);
            this.universe.registerBackdrop('map', 'map-component', { routes: ['console.fleet-ops'] });
            assert.strictEqual(this.service.active, null, 'no current route');
            this.router.currentRouteName = 'console.storefront';
            assert.strictEqual(this.service.active, null);
            assert.deepEqual(this.service.mounted, []);
            assert.false(this.service.isActive('map'));
        });

        test('the active backdrop follows the route and late registrations', function (assert) {
            this.router.currentRouteName = 'console.fleet-ops.operations.orders.index';
            assert.strictEqual(this.service.active, null);

            this.universe.registerBackdrop('map', 'map-component', { routes: ['console.fleet-ops'] });
            assert.strictEqual(this.service.active?.name, 'map', 'a backdrop registered later is picked up');
            assert.true(this.service.isActive('map'));

            this.universe.registerBackdrop('orders-map', 'orders-component', { routes: ['console.fleet-ops.operations.orders'], priority: 1 });
            assert.strictEqual(this.service.active.name, 'orders-map');
        });

        test('keep-alive backdrops stay mounted after their routes are left', function (assert) {
            this.universe.registerBackdrop('map', 'map-component', { routes: ['console.fleet-ops'] });
            this.universe.registerBackdrop('scratch', 'scratch-component', { routes: ['console.scratch'], keepAlive: false });
            this.universe.registerBackdrop('never', 'never-component', { routes: ['console.never'] });

            transitionTo(this.router, 'console.fleet-ops.operations.orders.index');
            assert.deepEqual(
                this.service.mounted.map((b) => b.name),
                ['map']
            );

            transitionTo(this.router, 'console.scratch');
            assert.deepEqual(
                this.service.mounted.map((b) => b.name),
                ['map', 'scratch'],
                'the active backdrop is mounted even without keepAlive; order follows registration'
            );
            assert.strictEqual(this.service.active.name, 'scratch');

            transitionTo(this.router, 'console.home');
            assert.strictEqual(this.service.active, null);
            assert.deepEqual(
                this.service.mounted.map((b) => b.name),
                ['map'],
                'the keep-alive map stays, the other is dropped'
            );

            transitionTo(this.router, 'console.fleet-ops');
            transitionTo(this.router, 'console.home');
            assert.deepEqual(
                this.service.mounted.map((b) => b.name),
                ['map'],
                'reactivating does not duplicate'
            );
        });

        test('a backdrop that became active without a transition is kept when the route is left', function (assert) {
            this.router.currentRouteName = 'console.fleet-ops';
            this.universe.registerBackdrop('map', 'map-component', { routes: ['console.fleet-ops'] });

            transitionTo(this.router, 'console.home');
            assert.deepEqual(
                this.service.mounted.map((b) => b.name),
                ['map']
            );
        });

        test('query-param-only transitions change nothing', function (assert) {
            this.universe.registerBackdrop('map', 'map-component', { routes: ['console.fleet-ops'] });
            this.router.currentRouteName = 'console.fleet-ops';
            this.router.trigger('routeWillChange', { queryParamsOnly: true });
            this.router.trigger('routeDidChange', { queryParamsOnly: true });
            this.router.currentRouteName = 'console.home';
            assert.deepEqual(this.service.mounted, [], 'nothing was recorded');
        });
    });

    module('requests', function () {
        test('an owner is required', function (assert) {
            assert.throws(() => this.service.request(), /requires an owner/);
            assert.throws(() => this.service.request(null), /requires an owner/);
        });

        test('request and release are isolated per owner', function (assert) {
            this.router.currentRouteName = 'console.fleet-ops.operations.orders.index';
            const orders = { routeName: 'operations.orders.index', fullRouteName: 'console.fleet-ops.operations.orders.index' };
            const drivers = 'drivers-panel';

            const handle = this.service.request(orders, { layers: [{ id: 'o1' }, null, { id: 'o2' }], fitBounds: 'bounds', mode: 'live' });
            this.service.request(drivers, { layers: [{ id: 'd1' }], focus: 'd1' });

            assert.strictEqual(handle.owner, orders);
            assert.deepEqual(handle.layers, [{ id: 'o1' }, { id: 'o2' }], 'falsy layers are dropped');
            assert.false(handle.isReleased);
            assert.true(this.service.hasRequest(drivers));

            assert.deepEqual(this.service.state, {
                layers: [
                    { owner: orders, layers: [{ id: 'o1' }, { id: 'o2' }] },
                    { owner: drivers, layers: [{ id: 'd1' }] },
                ],
                fitBounds: 'bounds',
                focus: 'd1',
                mode: 'live',
            });

            assert.true(this.service.release(drivers));
            assert.false(this.service.release(drivers), 'releasing twice is a no-op');
            assert.false(this.service.release('stranger'));
            assert.deepEqual(this.service.state.layers, [{ owner: orders, layers: [{ id: 'o1' }, { id: 'o2' }] }], 'the other owner is untouched');
            assert.strictEqual(this.service.state.focus, null, 'merged keys fall back once their owner is gone');

            assert.true(handle.release());
            assert.true(handle.isReleased);
            assert.deepEqual(handle.layers, []);
            assert.deepEqual(this.service.state, { layers: [], fitBounds: null, focus: null, mode: null });
        });

        test('options default, and a non-array layers value is empty', function (assert) {
            const a = this.service.request('a');
            const b = this.service.request('b', null);
            const c = this.service.request('c', { layers: 'nope' });
            assert.deepEqual([a.layers, b.layers, c.layers], [[], [], []]);
        });

        test('the most recent request wins each merged key', function (assert) {
            this.service.request('a', { mode: 'live', focus: 'a' });
            this.service.request('b', { mode: 'edit' });
            assert.strictEqual(this.service.state.mode, 'edit');
            assert.strictEqual(this.service.state.focus, 'a', 'a key nobody newer set is kept');

            this.service.request('a', { mode: 'replay' });
            assert.strictEqual(this.service.state.mode, 'replay', 're-requesting makes an owner the newest');
            assert.strictEqual(this.service.state.focus, null, 're-requesting replaces the whole entry');
            assert.deepEqual(
                this.service.state.layers.map((group) => group.owner),
                ['a', 'b'],
                'groups keep their first request order'
            );
        });

        test('handle.update merges into the owner entry', function (assert) {
            const handle = this.service.request('a', { layers: [1], mode: 'live', focus: 'x' });
            handle.update({ focus: 'y' });
            assert.deepEqual(this.service.state, { layers: [{ owner: 'a', layers: [1] }], fitBounds: null, focus: 'y', mode: 'live' });

            handle.update();
            assert.strictEqual(this.service.state.focus, 'y');

            handle.release();
            handle.update({ layers: [2] });
            assert.deepEqual(this.service.state.layers, [{ owner: 'a', layers: [2] }], 'updating after release requests again');
            assert.strictEqual(this.service.state.mode, null);
        });

        test('layers are released when the route they were requested from is exited', function (assert) {
            this.router.currentRouteName = 'console.fleet-ops.operations.orders.index';

            const route = { fullRouteName: 'console.fleet-ops.operations.orders.index' };
            const engineRoute = { routeName: 'console.fleet-ops.operations' };
            const component = {};
            const scoped = 'scoped';
            const unscoped = 'unscoped';

            this.service.request(route, { layers: ['route'] });
            this.service.request(engineRoute, { layers: ['engine'] });
            this.service.request(component, { layers: ['component'] });
            this.service.request(scoped, { layers: ['scoped'], route: 'console.fleet-ops' });

            this.router.currentRouteName = undefined;
            this.service.request(unscoped, { layers: ['unscoped'] });

            transitionTo(this.router, 'console.fleet-ops.operations.orders.index.details');
            assert.deepEqual(
                this.service.state.layers.map((group) => group.layers[0]),
                ['route', 'engine', 'component', 'scoped', 'unscoped'],
                'child routes keep their parents’ layers'
            );

            transitionTo(this.router, 'console.fleet-ops.operations.vehicles');
            assert.deepEqual(
                this.service.state.layers.map((group) => group.layers[0]),
                ['engine', 'scoped', 'unscoped']
            );

            transitionTo(this.router, 'console.home');
            assert.deepEqual(
                this.service.state.layers.map((group) => group.layers[0]),
                ['unscoped'],
                'an owner with no route is only released explicitly'
            );
        });

        test('a request made while a transition runs belongs to the route being entered', function (assert) {
            this.router.currentRouteName = 'console.home';
            this.router.trigger('routeWillChange', { to: { name: 'console.fleet-ops.operations.orders.index' } });
            this.service.request('model-hook', { layers: ['x'] });
            this.router.currentRouteName = 'console.fleet-ops.operations.orders.index';
            this.router.trigger('routeDidChange', {});
            assert.true(this.service.hasRequest('model-hook'));

            this.router.trigger('routeWillChange');
            this.service.request('no-target', { layers: ['y'] });
            this.router.currentRouteName = 'console.home';
            this.router.trigger('routeDidChange');
            assert.false(this.service.hasRequest('model-hook'));
            assert.false(this.service.hasRequest('no-target'), 'without a target route it falls back to the current one');
        });

        test('an owner is released when it is destroyed', async function (assert) {
            const component = EmberObject.create();
            this.service.request(component, { layers: ['c'] });
            this.service.request(component, { layers: ['c2'] });

            destroy(component);
            await settled();
            assert.false(this.service.hasRequest(component));

            const gone = EmberObject.create();
            destroy(gone);
            await settled();
            this.service.request(gone, { layers: ['late'] });
            assert.true(this.service.hasRequest(gone), 'a destroyed owner can still request; release() or route exit clears it');
        });
    });

    module('map instance and replay', function () {
        test('onReady runs queued callbacks once the active backdrop registers its map', function (assert) {
            this.universe.registerBackdrop('map', 'map-component', { routes: ['console.fleet-ops'] });
            this.universe.registerBackdrop('other', 'other-component', { routes: ['console.other'] });

            assert.strictEqual(this.service.instance, null, 'no active backdrop');
            this.service.setInstance({ id: 'ignored' });
            assert.strictEqual(this.service.instance, null, 'no name and no active backdrop');

            transitionTo(this.router, 'console.fleet-ops');
            this.service.request('orders', { layers: ['early'] });

            const calls = [];
            this.service.onReady((instance, state) => calls.push(['first', instance.id, state.layers[0].layers]));
            const cancel = this.service.onReady(() => calls.push(['cancelled']));
            cancel();
            assert.false(this.service.isReady);

            this.service.setInstance({ id: 'other-map' }, 'other');
            assert.deepEqual(calls, [], 'an inactive backdrop becoming ready does not flush');

            const map = { id: 'leaflet' };
            this.service.setInstance(map);
            assert.true(this.service.isReady);
            assert.strictEqual(this.service.instance, map);
            assert.deepEqual(calls, [['first', 'leaflet', ['early']]], 'requests made before ready are replayed via state');

            const cancelNow = this.service.onReady((instance) => calls.push(['now', instance.id]));
            cancelNow();
            assert.deepEqual(calls.at(-1), ['now', 'leaflet'], 'runs at once when ready');

            this.service.setInstance({ id: 'again' });
            assert.strictEqual(calls.length, 2, 'callbacks run once');

            this.service.setInstance(null);
            assert.strictEqual(this.service.instance, null, 'null clears the instance');
            assert.false(this.service.isReady);
        });

        test('a transition onto a backdrop that is already ready flushes the queue', function (assert) {
            this.universe.registerBackdrop('map', 'map-component', { routes: ['console.fleet-ops'] });
            this.universe.registerBackdrop('other', 'other-component', { routes: ['console.other'] });
            transitionTo(this.router, 'console.other');
            this.service.setInstance({ id: 'other-map' });

            transitionTo(this.router, 'console.home');
            const calls = [];
            this.service.onReady((instance) => calls.push(instance.id));
            transitionTo(this.router, 'console.fleet-ops');
            assert.deepEqual(calls, [], 'the map backdrop has no instance yet');

            transitionTo(this.router, 'console.other');
            assert.deepEqual(calls, ['other-map']);
        });
    });
});

module('Unit | Service | backdrop (without router events)', function (hooks) {
    setupTest(hooks);

    test('it works with a router and universe that lack the optional APIs', function (assert) {
        this.owner.register('service:router', class extends Service {});
        this.owner.register('service:universe', class extends Service {});
        const service = this.owner.lookup('service:backdrop');

        assert.strictEqual(service.active, null);
        assert.deepEqual(service.mounted, []);
        service.request('a', { layers: [1] });
        assert.strictEqual(service.state.layers.length, 1);
    });

    test('it listens to the router even when universe is not evented', function (assert) {
        this.owner.register('service:router', RouterStub);
        this.owner.register('service:universe', class extends Service {});
        const router = this.owner.lookup('service:router');
        const service = this.owner.lookup('service:backdrop');

        router.currentRouteName = 'console.a';
        service.request('a');
        transitionTo(router, 'console.b');
        assert.false(service.hasRequest('a'));
    });
});

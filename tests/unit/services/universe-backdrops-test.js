import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

/**
 * Backdrops are registered on universe and stored in the shared registry under
 * backdrop:registration, so every engine sees the same list.
 */
module('Unit | Service | universe (backdrops)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.universe = this.owner.lookup('service:universe');
        this.universe.registryService.clearList('backdrop', 'registration');
    });

    test('a backdrop is registered with defaults and listed', function (assert) {
        const events = [];
        this.universe.on('backdrop.registered', (registration) => events.push(registration.name));

        const component = class LiveMap {};
        const registration = this.universe.registerBackdrop('fleet-ops:live-map', component, { routes: 'console.fleet-ops', label: 'Live map' });

        assert.deepEqual(events, ['fleet-ops:live-map']);
        assert.strictEqual(registration.component, component);
        assert.deepEqual(registration.routes, ['console.fleet-ops'], 'a single route becomes a list');
        assert.strictEqual(registration.priority, 0);
        assert.true(registration.keepAlive);
        assert.strictEqual(registration.label, 'Live map', 'extra options are kept');

        const listed = this.universe.getBackdrops();
        assert.deepEqual(
            listed.map((b) => b.name),
            ['fleet-ops:live-map']
        );
        listed.pop();
        assert.strictEqual(this.universe.getBackdrops().length, 1, 'the returned list is a copy');
    });

    test('options are normalised', function (assert) {
        const a = this.universe.registerBackdrop('a', 'a-component', { routes: ['console.a', '', null, 'console.b'], priority: 5, keepAlive: false });
        assert.deepEqual(a.routes, ['console.a', 'console.b']);
        assert.strictEqual(a.priority, 5);
        assert.false(a.keepAlive);

        const b = this.universe.registerBackdrop('b', 'b-component', null);
        assert.deepEqual(b.routes, [], 'no routes means it matches none');
        assert.strictEqual(b.priority, 0);
        assert.true(b.keepAlive);

        const c = this.universe.registerBackdrop('c', 'c-component', { priority: 'high' });
        assert.strictEqual(c.priority, 0, 'a non-numeric priority becomes 0');

        const d = this.universe.registerBackdrop('d', 'd-component');
        assert.deepEqual(d.routes, []);
    });

    test('registering a name again replaces the backdrop', function (assert) {
        this.universe.registerBackdrop('map', 'first', { routes: ['console'] });
        this.universe.registerBackdrop('other', 'other', { routes: ['console'] });
        this.universe.registerBackdrop('map', 'second', { routes: ['console.fleet-ops'] });

        const backdrops = this.universe.getBackdrops();
        assert.deepEqual(
            backdrops.map((b) => [b.name, b.component]),
            [
                ['map', 'second'],
                ['other', 'other'],
            ]
        );
    });

    test('name and component are required', function (assert) {
        assert.throws(() => this.universe.registerBackdrop(), /requires a string name/);
        assert.throws(() => this.universe.registerBackdrop(42, 'x'), /requires a string name/);
        assert.throws(() => this.universe.registerBackdrop('map'), /"map" requires a component/);
    });
});

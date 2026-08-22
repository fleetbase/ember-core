import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import UniverseRegistry from '@fleetbase/ember-core/contracts/universe-registry';

/**
 * RegistryService is the storage every other universe service is built on:
 * a map of section name to an object of named lists.
 *
 * These tests exercise the real service — including its TrackedMap/TrackedObject
 * backing from tracked-built-ins — rather than the in-memory stand-in the
 * menu and widget service tests use.
 */
module('Unit | Service | universe/registry-service', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:universe/registry-service');
        this.service.clearAll();
    });

    hooks.afterEach(function () {
        // The registry is an application-level singleton whenever an
        // application is reachable, so anything left behind would leak into
        // the next test.
        this.service.clearAll();
    });

    module('the backing registry', function () {
        test('it exposes a registry of sections', function (assert) {
            assert.true(this.service.registry instanceof UniverseRegistry);
            assert.strictEqual(this.service.registries.size, 0, 'it starts empty');
        });

        test('a fresh UniverseRegistry has an empty map', function (assert) {
            assert.strictEqual(new UniverseRegistry().registries.size, 0);
        });

        test('setApplicationInstance records the application', function (assert) {
            const application = {};

            this.service.setApplicationInstance(application);

            assert.strictEqual(this.service.applicationInstance, application);
        });
    });

    module('sections and lists', function () {
        test('a section is created on demand and reused', function (assert) {
            const section = this.service.getOrCreateSection('console:admin');

            assert.strictEqual(this.service.getOrCreateSection('console:admin'), section);
            assert.true(this.service.hasSection('console:admin'));
        });

        test('a list is created on demand within its section', function (assert) {
            const list = this.service.getOrCreateList('console:admin', 'menu-item');

            assert.deepEqual(list.slice(), []);
            assert.strictEqual(this.service.getOrCreateList('console:admin', 'menu-item'), list, 'the same list comes back');
            assert.true(this.service.hasList('console:admin', 'menu-item'));
        });

        test('sections and lists that were never created are reported absent', function (assert) {
            assert.false(this.service.hasSection('nope'));
            assert.false(this.service.hasList('nope', 'menu-item'));

            this.service.getOrCreateSection('console:admin');
            assert.false(this.service.hasList('console:admin', 'never-made'));
        });

        test('getSection returns the section or null', function (assert) {
            this.service.getOrCreateList('console:admin', 'menu-item');

            assert.ok(this.service.getSection('console:admin'));
            assert.strictEqual(this.service.getSection('nope'), null);
        });

        test('one section can hold several lists', function (assert) {
            this.service.register('console:admin', 'menu-item', 'a', { title: 'Item' });
            this.service.register('console:admin', 'menu-panel', 'b', { title: 'Panel' });

            assert.strictEqual(this.service.getRegistry('console:admin', 'menu-item').length, 1);
            assert.strictEqual(this.service.getRegistry('console:admin', 'menu-panel').length, 1);
        });

        test('createRegistry builds a menu-item list by default', function (assert) {
            const list = this.service.createRegistry('engine:fleet-ops');

            assert.strictEqual(list, this.service.getRegistry('engine:fleet-ops', 'menu-item'));
        });

        test('createRegistry accepts an explicit type', function (assert) {
            this.service.createRegistry('engine:fleet-ops', 'widget');

            assert.true(this.service.hasList('engine:fleet-ops', 'widget'));
        });

        test('createRegistries builds several at once', function (assert) {
            this.service.createRegistries(['a', 'b']);

            assert.true(this.service.hasSection('a'));
            assert.true(this.service.hasSection('b'));
        });

        test('createRegistries ignores a non-array', function (assert) {
            this.service.createRegistries('a');

            assert.false(this.service.hasSection('a'));
        });

        test('createSection and createSections create sections without lists', function (assert) {
            this.service.createSection('one');
            this.service.createSections(['two', 'three']);

            assert.true(this.service.hasSection('one'));
            assert.true(this.service.hasSection('two'));
            assert.true(this.service.hasSection('three'));
            assert.false(this.service.hasList('one', 'menu-item'), 'no list is implied');
        });
    });

    module('register and read back', function () {
        test('an item is stored with its key', function (assert) {
            const item = { title: 'Orders' };

            this.service.register('console:admin', 'menu-item', 'orders', item);

            assert.strictEqual(item._registryKey, 'orders', 'the key is stamped onto the value');
            assert.deepEqual(this.service.getRegistry('console:admin', 'menu-item').slice(), [item]);
        });

        test('an unknown section or list reads back empty', function (assert) {
            assert.deepEqual(this.service.getRegistry('nope', 'menu-item').slice(), []);

            this.service.getOrCreateSection('console:admin');
            assert.deepEqual(this.service.getRegistry('console:admin', 'never-made').slice(), []);
        });

        test('registering the same key again replaces the item in place', function (assert) {
            this.service.register('s', 'l', 'a', { title: 'First' });
            this.service.register('s', 'l', 'b', { title: 'Other' });
            this.service.register('s', 'l', 'a', { title: 'Second' });

            assert.deepEqual(
                this.service.getRegistry('s', 'l').map((i) => i.title),
                ['Second', 'Other'],
                'the replacement keeps its original position'
            );
        });

        test('an existing item is matched by slug, id or widgetId as well as key', function (assert) {
            this.service.register('s', 'l', 'first-key', { slug: 'shared-slug', title: 'First' });

            this.service.register('s', 'l', 'shared-slug', { title: 'Second' });

            assert.strictEqual(this.service.getRegistry('s', 'l').length, 1, 'the slug match counted as the same item');
            assert.strictEqual(this.service.getRegistry('s', 'l')[0].title, 'Second');
        });

        test('a non-object value is stored without a key stamp', function (assert) {
            this.service.register('s', 'l', 'a', 'just a string');

            assert.deepEqual(this.service.getRegistry('s', 'l').slice(), ['just a string']);
        });

        test('non-object values never match, so they accumulate', function (assert) {
            this.service.register('s', 'l', 'a', 'one');
            this.service.register('s', 'l', 'a', 'two');

            assert.deepEqual(this.service.getRegistry('s', 'l').slice(), ['one', 'two'], 'the duplicate-key check only inspects objects');
        });
    });

    module('lookup', function () {
        test('an item is found by its registry key', function (assert) {
            this.service.register('s', 'l', 'orders', { title: 'Orders' });

            assert.strictEqual(this.service.lookup('s', 'l', 'orders').title, 'Orders');
        });

        test('an item is also found by slug, id or widgetId', function (assert) {
            this.service.register('s', 'l', 'k1', { slug: 'by-slug' });
            this.service.register('s', 'l', 'k2', { id: 'by-id' });
            this.service.register('s', 'l', 'k3', { widgetId: 'by-widget-id' });

            assert.ok(this.service.lookup('s', 'l', 'by-slug'));
            assert.ok(this.service.lookup('s', 'l', 'by-id'));
            assert.ok(this.service.lookup('s', 'l', 'by-widget-id'));
        });

        test('a miss is null', function (assert) {
            this.service.register('s', 'l', 'orders', { title: 'Orders' });

            assert.strictEqual(this.service.lookup('s', 'l', 'nope'), null);
            assert.strictEqual(this.service.lookup('nope', 'l', 'orders'), null);
        });

        test('getAllFromPrefix matches on the registry key', function (assert) {
            this.service.register('s', 'l', 'organization:billing', { title: 'Billing' });
            this.service.register('s', 'l', 'organization:members', { title: 'Members' });
            this.service.register('s', 'l', 'user:profile', { title: 'Profile' });

            assert.deepEqual(
                this.service.getAllFromPrefix('s', 'l', 'organization:').map((i) => i.title),
                ['Billing', 'Members']
            );
        });

        test('getAllFromPrefix skips items with no key and unknown lists', function (assert) {
            this.service.register('s', 'l', 'a', 'a string');

            assert.deepEqual(this.service.getAllFromPrefix('s', 'l', 'a').slice(), []);
            assert.deepEqual(this.service.getAllFromPrefix('nope', 'l', 'a').slice(), []);
        });
    });

    module('renderable components', function () {
        test('a component is keyed by its name', function (assert) {
            this.service.registerRenderableComponent('slot', { name: 'order-details' });

            assert.deepEqual(
                this.service.getRenderableComponents('slot').map((c) => c.name),
                ['order-details']
            );
        });

        test('a path is used when there is no name', function (assert) {
            this.service.registerRenderableComponent('slot', { path: 'components/order-details' });

            assert.strictEqual(this.service.getRenderableComponents('slot')[0]._registryKey, 'components/order-details');
        });

        test('an explicit registry key wins', function (assert) {
            this.service.registerRenderableComponent('slot', { _registryKey: 'explicit', name: 'ignored' });

            assert.strictEqual(this.service.getRenderableComponents('slot')[0]._registryKey, 'explicit');
        });

        test('an array registers each component', function (assert) {
            this.service.registerRenderableComponent('slot', [{ name: 'one' }, { name: 'two' }]);

            assert.deepEqual(
                this.service.getRenderableComponents('slot').map((c) => c.name),
                ['one', 'two']
            );
        });

        test('an unknown slot has no components', function (assert) {
            assert.deepEqual(this.service.getRenderableComponents('nope').slice(), []);
        });
    });

    module('clearing', function () {
        test('clearList empties one list and leaves its neighbours', function (assert) {
            this.service.register('s', 'one', 'a', { title: 'A' });
            this.service.register('s', 'two', 'b', { title: 'B' });

            this.service.clearList('s', 'one');

            assert.deepEqual(this.service.getRegistry('s', 'one').slice(), []);
            assert.strictEqual(this.service.getRegistry('s', 'two').length, 1);
        });

        test('clearing an unknown list or section is harmless', function (assert) {
            this.service.clearList('nope', 'l');
            this.service.clearSection('nope');

            assert.strictEqual(this.service.registries.size, 0);
        });

        test('clearSection removes the section entirely', function (assert) {
            this.service.register('s', 'l', 'a', { title: 'A' });

            this.service.clearSection('s');

            assert.false(this.service.hasSection('s'));
        });

        test('clearAll empties every section', function (assert) {
            this.service.register('one', 'l', 'a', { title: 'A' });
            this.service.register('two', 'l', 'b', { title: 'B' });

            this.service.clearAll();

            assert.strictEqual(this.service.registries.size, 0);
            assert.deepEqual(this.service.getRegistry('one', 'l').slice(), []);
        });
    });

    module('container registration', function () {
        test('a component is registered on the application instance', function (assert) {
            const registered = [];
            this.service.setApplicationInstance({ register: (...args) => registered.push(args) });

            class Thing {}
            this.service.registerComponent('my-thing', Thing, { singleton: true });

            assert.deepEqual(registered, [['component:my-thing', Thing, { singleton: true }]]);
        });

        test('a service is registered on the application instance', function (assert) {
            const registered = [];
            this.service.setApplicationInstance({ register: (...args) => registered.push(args) });

            class Thing {}
            this.service.registerService('my-thing', Thing);

            assert.deepEqual(registered, [['service:my-thing', Thing, {}]]);
        });

        test('without an application instance the registration is skipped rather than thrown', function (assert) {
            this.service.setApplicationInstance(null);

            this.service.registerComponent('my-thing', class {});
            this.service.registerService('my-thing', class {});

            assert.true(true, 'no error was raised');
        });
    });
});

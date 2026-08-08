import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * The registry's own edges: looking up through a list that holds something
 * other than an object, the generated key a component falls back to, and the
 * two clear paths.
 */
let uniqueSection = 0;

module('Unit | Service | universe/registry-service (branches)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe', class extends Service {});
        this.service = this.owner.lookup('service:universe/registry-service');
    });

    module('lookup', function () {
        test('it matches on any of the four key properties', function (assert) {
            this.service.register('sec', 'items', 'by-registry-key', { name: 'A' });
            this.service.register('sec', 'items', 'ignored', { slug: 'by-slug' });
            this.service.register('sec', 'items', 'also-ignored', { id: 'by-id' });
            this.service.register('sec', 'items', 'still-ignored', { widgetId: 'by-widget-id' });

            assert.strictEqual(this.service.lookup('sec', 'items', 'by-registry-key').name, 'A');
            assert.strictEqual(this.service.lookup('sec', 'items', 'by-slug').slug, 'by-slug');
            assert.strictEqual(this.service.lookup('sec', 'items', 'by-id').id, 'by-id');
            assert.strictEqual(this.service.lookup('sec', 'items', 'by-widget-id').widgetId, 'by-widget-id');
        });

        test('a list holding a primitive skips it rather than throwing', function (assert) {
            this.service.register('sec', 'items', 'a-string', 'just a string');
            this.service.register('sec', 'items', 'wanted', { slug: 'wanted' });

            assert.strictEqual(this.service.lookup('sec', 'items', 'wanted').slug, 'wanted');
        });

        test('a list holding null skips it too', function (assert) {
            this.service.register('sec', 'items', 'nothing', null);
            this.service.register('sec', 'items', 'wanted', { slug: 'wanted' });

            assert.strictEqual(this.service.lookup('sec', 'items', 'wanted').slug, 'wanted');
        });

        test('a key that matches nothing yields null', function (assert) {
            this.service.register('sec', 'items', 'a', { slug: 'a' });

            assert.strictEqual(this.service.lookup('sec', 'items', 'missing'), null);
        });

        test('a section that does not exist yields null', function (assert) {
            assert.strictEqual(this.service.lookup('nope', 'items', 'a'), null);
        });
    });

    module('registerRenderableComponent keys', function (hooks) {
        hooks.beforeEach(function () {
            // The registry singleton lives on the Application, which outlives
            // each test's owner — so entries accumulate across the run and a
            // shared section name would read the previous test's component.
            // Every test here gets a section of its own.
            this.slot = `slot-${(uniqueSection += 1)}`;
            this.keys = () => this.service.getRegistry(this.slot, 'components').map((c) => c._registryKey);
        });

        test('an explicit registry key wins', function (assert) {
            this.service.registerRenderableComponent(this.slot, { _registryKey: 'chosen', name: 'Ignored' });

            assert.deepEqual(this.keys(), ['chosen']);
        });

        test('a class is stored but its key is thrown away, so it cannot be looked up', function (assert) {
            // Pinned, not fixed. registerRenderableComponent computes the key as
            //     component._registryKey || component.name || component.path || `component-...`
            // which resolves to 'OrderCard' for a class. But `register` only
            // stamps the key onto the value when it is an object:
            //     if (typeof value === 'object' && value !== null) { value._registryKey = key; }
            // and a class is a FUNCTION, so the key is discarded. `lookup` then
            // skips non-objects for the same reason, making the component
            // unfindable by the name it was keyed under.
            class OrderCard {}

            this.service.registerRenderableComponent(this.slot, OrderCard);

            assert.strictEqual(this.service.getRegistry(this.slot, 'components')[0], OrderCard, 'it is stored');
            assert.deepEqual(this.keys(), [undefined], 'but with no key on it');
            assert.strictEqual(this.service.lookup(this.slot, 'components', 'OrderCard'), null, 'so nothing finds it');
        });

        test('a plain object with a name keeps its key', function (assert) {
            this.service.registerRenderableComponent(this.slot, { name: 'OrderCard' });

            assert.deepEqual(this.keys(), ['OrderCard'], 'an object is stamped, a class is not');
        });

        test('a definition with a path falls back to that', function (assert) {
            this.service.registerRenderableComponent(this.slot, { path: 'components/order-card' });

            assert.deepEqual(this.keys(), ['components/order-card']);
        });

        test('a definition with none of them gets a generated key', function (assert) {
            this.service.registerRenderableComponent(this.slot, { render: true });

            const [key] = this.keys();
            assert.true(key.startsWith('component-'), `a generated key, got ${key}`);
        });

        test('an array registers each of its members', function (assert) {
            this.service.registerRenderableComponent(this.slot, [{ path: 'a' }, { path: 'b' }]);

            assert.deepEqual(this.keys(), ['a', 'b']);
        });
    });

    module('createSections', function () {
        test('it creates one section per name', function (assert) {
            this.service.createSections(['a', 'b']);

            assert.true(this.service.hasSection('a'));
            assert.true(this.service.hasSection('b'));
        });

        test('anything that is not an array is ignored', function (assert) {
            this.service.createSections('not-an-array');
            this.service.createSections();

            assert.false(this.service.hasSection('not-an-array'));
        });
    });

    module('clearing', function () {
        test('clearSection drops the whole section', function (assert) {
            this.service.register('sec', 'items', 'a', { slug: 'a' });

            this.service.clearSection('sec');

            assert.false(this.service.hasSection('sec'));
            assert.deepEqual(this.service.getRegistry('sec', 'items'), []);
        });

        test('clearSection on a section that is not there is harmless', function (assert) {
            this.service.clearSection('nope');

            assert.false(this.service.hasSection('nope'));
        });

        test('a list that offers clear() has it called', function (assert) {
            // The lists this service builds are plain arrays, which have no
            // clear(), so this reaches the other arm of that guard.
            let cleared = 0;
            this.service.createSection('sec');
            this.service.registries.get('sec').items = { clear: () => (cleared += 1) };

            this.service.clearSection('sec');

            assert.strictEqual(cleared, 1);
        });

        test('clearAll empties every section', function (assert) {
            this.service.register('one', 'items', 'a', { slug: 'a' });
            this.service.register('two', 'items', 'b', { slug: 'b' });

            this.service.clearAll();

            assert.false(this.service.hasSection('one'));
            assert.false(this.service.hasSection('two'));
        });

        test('clearAll calls clear() on any list that offers it', function (assert) {
            let cleared = 0;
            this.service.createSection('sec');
            this.service.registries.get('sec').items = { clear: () => (cleared += 1) };

            this.service.clearAll();

            assert.strictEqual(cleared, 1);
        });
    });
});

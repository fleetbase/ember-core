import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import MenuItem from '@fleetbase/ember-core/contracts/menu-item';
import MenuPanel from '@fleetbase/ember-core/contracts/menu-panel';

/**
 * Every registration method funnels through two private normalizers, and each
 * accepts three shapes: a contract instance, a plain object, or a title string
 * plus options. The sibling test drives the title-string form; these cover the
 * other two, the full option-key mapping, and the onClick wrapping.
 */
class RegistryStubService extends Service {
    registries = new Map();

    register(section, list, key, value) {
        const registryKey = `${section}:${list}`;
        const registry = this.registries.get(registryKey) ?? [];
        const record = Object.assign(value, { _registryKey: key });
        const existingIndex = registry.findIndex((item) => item._registryKey === key);

        if (existingIndex === -1) {
            registry.push(record);
        } else {
            registry[existingIndex] = record;
        }

        this.registries.set(registryKey, registry);
    }

    getRegistry(section, list) {
        return this.registries.get(`${section}:${list}`) ?? [];
    }

    lookup(section, list, key) {
        return this.getRegistry(section, list).find((item) => item._registryKey === key) ?? null;
    }
}

module('Unit | Service | universe/menu-service (normalization)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe/registry-service', RegistryStubService);
        this.owner.register('service:universe', class extends Service {});

        this.service = this.owner.lookup('service:universe/menu-service');
        this.registry = this.owner.lookup('service:universe/registry-service');
        this.universe = this.owner.lookup('service:universe');

        this.headerItems = () => this.registry.getRegistry('console:header', 'menu-item');
        this.itemsIn = (registryName) => this.registry.getRegistry(registryName, 'menu-item');
    });

    module('a menu item given as an object', function () {
        test('an object without a title is stored as-is', function (assert) {
            const item = { route: 'console.orders', icon: 'box', slug: 'orders' };

            this.service.registerHeaderMenuItem(item);

            assert.strictEqual(this.headerItems()[0].route, 'console.orders');
            assert.strictEqual(this.headerItems()[0].icon, 'box');
        });

        test('an object WITH a title is not treated as an object', function (assert) {
            // The guard is `typeof input === 'object' && input !== null &&
            // !input.title`, so a titled object falls past the object branch and
            // past the string branch to the final else, which also returns it
            // unchanged — the same outcome by a different route.
            const item = { title: 'Orders', route: 'console.orders', slug: 'orders' };

            this.service.registerHeaderMenuItem(item);

            assert.strictEqual(this.headerItems()[0].title, 'Orders');
        });

        test('a MenuItem instance is converted to its plain object form', function (assert) {
            const menuItem = new MenuItem('Orders', 'console.orders').withIcon('box').withSlug('orders');

            this.service.registerHeaderMenuItem(menuItem);

            const stored = this.headerItems()[0];
            assert.strictEqual(stored.title, 'Orders');
            assert.strictEqual(stored.icon, 'box');
            assert.false(stored instanceof MenuItem, 'the contract itself is not stored');
        });

        test('registerMenuItem accepts a MenuItem instance directly', function (assert) {
            const menuItem = new MenuItem('Drivers', 'console.drivers').withSlug('drivers');

            this.service.registerMenuItem('engine:fleet-ops', menuItem);

            assert.strictEqual(this.itemsIn('engine:fleet-ops')[0].title, 'Drivers');
        });
    });

    module('the option keys a title string accepts', function () {
        test('every documented option maps onto the built item', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', {
                icon: 'box',
                priority: 2,
                component: 'order-list',
                slug: 'orders',
                section: 'ops',
                index: 1,
                type: 'link',
                wrapperClass: 'wrap',
                queryParams: { view: 'list' },
            });

            const stored = this.headerItems()[0];
            assert.strictEqual(stored.icon, 'box');
            assert.strictEqual(stored.priority, 2);
            assert.strictEqual(stored.component, 'order-list');
            assert.strictEqual(stored.slug, 'orders');
            assert.strictEqual(stored.section, 'ops');
            assert.strictEqual(stored.index, 1);
            assert.strictEqual(stored.type, 'link');
            assert.strictEqual(stored.wrapperClass, 'wrap');
            assert.deepEqual(stored.queryParams, { view: 'list' });
        });

        test('an unrecognised option is stored verbatim', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', { slug: 'orders', badge: 'new' });

            assert.strictEqual(this.headerItems()[0].badge, 'new');
        });
    });

    module('the onClick wrapper', function () {
        test('an object handler is wrapped so it receives the item and the universe', function (assert) {
            const seen = [];
            const item = { route: 'console.orders', slug: 'orders', onClick: (...args) => seen.push(args) };

            this.service.registerHeaderMenuItem(item);
            this.headerItems()[0].onClick();

            assert.strictEqual(seen[0][0], this.headerItems()[0], 'the menu item comes first');
            assert.strictEqual(seen[0][1], this.universe, 'then the universe service');
        });

        test('the wrapper returns whatever the handler returns', function (assert) {
            const item = { slug: 'orders', onClick: () => 'handled' };

            this.service.registerHeaderMenuItem(item);

            assert.strictEqual(this.headerItems()[0].onClick(), 'handled');
        });

        test('a non-function onClick is left exactly as it was', function (assert) {
            const item = { slug: 'orders', onClick: null };

            this.service.registerHeaderMenuItem(item);

            assert.strictEqual(this.headerItems()[0].onClick, null, 'and nothing is wrapped around it');
        });
    });

    module('menu panels', function () {
        test('a MenuPanel instance is converted to its plain object form', function (assert) {
            const panel = new MenuPanel('Fleet Ops', []).withSlug('fleet-ops').withIcon('truck');

            this.service.registerAdminMenuPanel(panel);

            const stored = this.registry.getRegistry('console:admin', 'menu-panel')[0];
            assert.strictEqual(stored.title, 'Fleet Ops');
            assert.strictEqual(stored.icon, 'truck');
            assert.false(stored instanceof MenuPanel);
        });

        test('a panel object without a title is stored as-is', function (assert) {
            this.service.registerAdminMenuPanel({ slug: 'fleet-ops', icon: 'truck', items: [] });

            assert.strictEqual(this.registry.getRegistry('console:admin', 'menu-panel')[0].icon, 'truck');
        });

        test('a title string builds a panel and applies its options', function (assert) {
            this.service.registerAdminMenuPanel('Fleet Ops', [], { slug: 'fleet-ops', icon: 'truck', priority: 5 });

            const stored = this.registry.getRegistry('console:admin', 'menu-panel')[0];
            assert.strictEqual(stored.slug, 'fleet-ops');
            assert.strictEqual(stored.icon, 'truck');
            assert.strictEqual(stored.priority, 5);
        });

        test('a panel that matches none of the three shapes is passed straight through', function (assert) {
            // The final `return input`. Nothing rejects it, so it is registered
            // under an undefined key — the normalizer has no failure mode.
            this.service.registerAdminMenuPanel('not-a-panel-object');

            const stored = this.registry.getRegistry('console:admin', 'menu-panel');
            assert.strictEqual(stored.length, 1);
            assert.strictEqual(stored[0].title, 'not-a-panel-object', 'a bare string still builds a panel');
        });
    });
});

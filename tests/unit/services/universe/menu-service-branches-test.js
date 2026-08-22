import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import MenuItem from '@fleetbase/ember-core/contracts/menu-item';

/**
 * The remaining menu-service branches: the admin and account registrations,
 * shortcut expansion, and the defaults each method declares but its callers
 * always supply.
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

module('Unit | Service | universe/menu-service (branches)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe/registry-service', RegistryStubService);
        this.owner.register('service:universe', class extends Service {});

        this.service = this.owner.lookup('service:universe/menu-service');
        this.registry = this.owner.lookup('service:universe/registry-service');

        this.itemsIn = (section) => this.registry.getRegistry(section, 'menu-item');
    });

    module('registerAdminMenuItem', function () {
        test('it defaults both route and options', function (assert) {
            this.service.registerAdminMenuItem('Extensions');

            const [item] = this.itemsIn('console:admin');
            assert.strictEqual(item.title, 'Extensions');
            assert.strictEqual(item.route, null);
        });

        test('a route and options are used when given', function (assert) {
            this.service.registerAdminMenuItem('Extensions', 'console.admin.extensions', { icon: 'plug', slug: 'extensions' });

            const [item] = this.itemsIn('console:admin');
            assert.strictEqual(item.route, 'console.admin.extensions');
            assert.strictEqual(item.icon, 'plug');
        });
    });

    module('account menu sections', function () {
        test('a user menu item defaults to the account section', function (assert) {
            this.service.registerUserMenuItem('Profile', { slug: 'profile' });

            assert.strictEqual(this.itemsIn('console:account')[0].section, 'account');
        });

        test('a section the caller supplies is kept', function (assert) {
            this.service.registerUserMenuItem('Profile', { slug: 'profile', section: 'personal' });

            assert.strictEqual(this.itemsIn('console:account')[0].section, 'personal');
        });

        test('a user item is keyed under a user: prefix', function (assert) {
            this.service.registerUserMenuItem('Profile', { slug: 'profile' });

            assert.strictEqual(this.itemsIn('console:account')[0]._registryKey, 'user:profile');
        });

        test('an organization item defaults to the settings section', function (assert) {
            this.service.registerOrganizationMenuItem('Billing', { slug: 'billing' });

            const [item] = this.itemsIn('console:account');
            assert.strictEqual(item.section, 'settings');
            assert.strictEqual(item._registryKey, 'organization:billing');
        });

        test('an organization section the caller supplies is kept', function (assert) {
            this.service.registerOrganizationMenuItem('Billing', { slug: 'billing', section: 'finance' });

            assert.strictEqual(this.itemsIn('console:account')[0].section, 'finance');
        });
    });

    module('header shortcuts', function () {
        test('each shortcut is registered as a header item of its own', function (assert) {
            const item = new MenuItem('Orders', 'console.orders').withSlug('orders').withPriority(3);
            item.withShortcuts([{ title: 'New order', route: 'console.orders.new', slug: 'new-order' }]);

            this.service.registerHeaderMenuItem(item);

            const slugs = this.itemsIn('header').map((i) => i._registryKey);
            assert.deepEqual(slugs, ['orders', 'new-order']);
        });

        test('a shortcut sits just below its parent in priority', function (assert) {
            const item = new MenuItem('Orders', 'console.orders').withSlug('orders').withPriority(3);
            item.withShortcuts([{ title: 'New order', slug: 'new-order' }]);

            this.service.registerHeaderMenuItem(item);

            const shortcut = this.itemsIn('header').find((i) => i._registryKey === 'new-order');
            assert.strictEqual(shortcut.priority, 4);
            assert.true(shortcut._isShortcut);
            assert.strictEqual(shortcut._parentTitle, 'Orders');
        });

        test('a parent with no priority puts its shortcut at one', function (assert) {
            const item = new MenuItem('Orders', 'console.orders').withSlug('orders');
            item.priority = null;
            item.withShortcuts([{ title: 'New order', slug: 'new-order' }]);

            this.service.registerHeaderMenuItem(item);

            assert.strictEqual(this.itemsIn('header').find((i) => i._registryKey === 'new-order').priority, 1);
        });
    });

    module('registerMenuItem defaults', function () {
        test('the route is derived from the registry name when none is given', function (assert) {
            this.service.registerMenuItem('fleet-ops', 'Drivers');

            assert.strictEqual(this.itemsIn('fleet-ops')[0].route, 'console.fleet-ops.virtual');
        });

        test('an explicit route wins', function (assert) {
            this.service.registerMenuItem('fleet-ops', 'Drivers', { route: 'console.fleet-ops.drivers' });

            assert.strictEqual(this.itemsIn('fleet-ops')[0].route, 'console.fleet-ops.drivers');
        });

        test('an item with no slug is keyed by its title', function (assert) {
            // registerMenuItem defaults slug to '~', so reaching the title
            // fallback needs an item that arrives already normalized.
            const item = new MenuItem('Drivers', 'console.drivers');
            item.slug = null;

            this.service.registerMenuItem('fleet-ops', item);

            assert.strictEqual(this.itemsIn('fleet-ops')[0]._registryKey, 'Drivers');
        });
    });

    module('the onClick wrapper guard', function () {
        test('a non-function onClick is left alone by the caller', function (assert) {
            // #wrapOnClickHandler used to repeat this check itself, which was
            // unreachable because the caller already does it:
            //     if (menuItemObj && typeof menuItemObj.onClick === 'function') {
            //         menuItemObj.onClick = this.#wrapOnClickHandler(...);
            //     }
            // The duplicate has been removed; the caller's guard is what keeps a
            // non-function value untouched.
            this.service.registerHeaderMenuItem({ slug: 'a', onClick: null });
            this.service.registerHeaderMenuItem({ slug: 'b', onClick: 'not a function' });

            assert.strictEqual(this.itemsIn('header')[0].onClick, null, 'left exactly as it was');
            assert.strictEqual(this.itemsIn('header')[1].onClick, 'not a function');
        });
    });
});

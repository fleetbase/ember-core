import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import MenuItem from '@fleetbase/ember-core/contracts/menu-item';

/**
 * MenuService stores every menu through the registry service and shapes what
 * comes back out: header items sorted with shortcuts pinned to the end, admin
 * items with panel members filtered away, and account items split into
 * organization and user sections.
 *
 * The registry is stubbed with the same in-memory stand-in the widget-service
 * tests use, so these assert the menu service's own behaviour rather than the
 * registry's.
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

module('Unit | Service | universe/menu-service', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe/registry-service', RegistryStubService);
        this.owner.register('service:universe', class extends Service {});

        this.service = this.owner.lookup('service:universe/menu-service');
        this.registry = this.owner.lookup('service:universe/registry-service');
    });

    module('header menu items', function () {
        test('a title and route register an item', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders');

            const [item] = this.service.getHeaderMenuItems();
            assert.strictEqual(item.title, 'Orders');
            assert.strictEqual(item.route, 'console.orders');
            assert.strictEqual(item.slug, 'orders', 'the slug is derived from the title');
        });

        test('options are applied to the built item', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', { icon: 'box', priority: 3, section: 'ops' });

            const [item] = this.service.getHeaderMenuItems();
            assert.strictEqual(item.icon, 'box');
            assert.strictEqual(item.priority, 3);
            assert.strictEqual(item.section, 'ops');
        });

        test('an unrecognised option is carried through as a plain option', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', { badge: 'new' });

            assert.strictEqual(this.service.getHeaderMenuItems()[0].badge, 'new');
        });

        test('a MenuItem instance can be registered directly', function (assert) {
            this.service.registerHeaderMenuItem(new MenuItem('Orders', 'console.orders').withIcon('box'));

            const [item] = this.service.getHeaderMenuItems();
            assert.strictEqual(item.title, 'Orders');
            assert.strictEqual(item.icon, 'box');
        });

        test('items are sorted by priority, lowest first', function (assert) {
            this.service.registerHeaderMenuItem('Third', 'r', { priority: 10 });
            this.service.registerHeaderMenuItem('First', 'r', { priority: 1 });
            this.service.registerHeaderMenuItem('Second', 'r', { priority: 5 });

            assert.deepEqual(
                this.service.getHeaderMenuItems().map((i) => i.title),
                ['First', 'Second', 'Third']
            );
        });

        test('the computed getter mirrors the method', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders');

            assert.deepEqual(
                this.service.headerMenuItems.map((i) => i.title),
                ['Orders']
            );
        });

        test('registration triggers an event', function (assert) {
            const seen = [];
            this.service.on('menuItem.registered', (item, registryName) => seen.push({ title: item.title, registryName }));

            this.service.registerHeaderMenuItem('Orders', 'console.orders');

            assert.deepEqual(seen, [{ title: 'Orders', registryName: 'header' }]);
        });
    });

    module('header shortcuts', function () {
        test('each shortcut becomes a first-class header item', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', {
                shortcuts: [{ title: 'New order' }],
            });

            assert.deepEqual(
                this.service.getHeaderMenuItems().map((i) => i.title),
                ['Orders', 'New order']
            );
        });

        test('shortcuts inherit the parent route, icon and tags', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', {
                icon: 'box',
                tags: ['ops'],
                shortcuts: [{ title: 'New order' }],
            });

            const shortcut = this.service.getHeaderMenuItems().find((i) => i._isShortcut);
            assert.strictEqual(shortcut.route, 'console.orders');
            assert.strictEqual(shortcut.icon, 'box');
            assert.deepEqual(shortcut.tags, ['ops']);
            assert.strictEqual(shortcut._parentTitle, 'Orders');
        });

        test('a shortcut can override what it inherits', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'console.orders', {
                icon: 'box',
                shortcuts: [{ title: 'New order', icon: 'plus', route: 'console.orders.new', tags: ['create'] }],
            });

            const shortcut = this.service.getHeaderMenuItems().find((i) => i._isShortcut);
            assert.strictEqual(shortcut.icon, 'plus');
            assert.strictEqual(shortcut.route, 'console.orders.new');
            assert.deepEqual(shortcut.tags, ['create']);
        });

        test('shortcuts are pinned after every extension regardless of priority', function (assert) {
            // This is the point of the split: the default bar is built by
            // slicing the first N items, so a shortcut sorting between two
            // extensions would displace a real extension.
            this.service.registerHeaderMenuItem('Low', 'r', { priority: 1, shortcuts: [{ title: 'Shortcut' }] });
            this.service.registerHeaderMenuItem('High', 'r', { priority: 50 });

            assert.deepEqual(
                this.service.getHeaderMenuItems().map((i) => i.title),
                ['Low', 'High', 'Shortcut']
            );
        });

        test('a shortcut is registered one step below its parent priority', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'r', { priority: 4, shortcuts: [{ title: 'New order' }] });

            const shortcut = this.service.getHeaderMenuItems().find((i) => i._isShortcut);
            assert.strictEqual(shortcut.priority, 5);
        });

        test('a shortcut may carry its own slug and id', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'r', { shortcuts: [{ title: 'New order', id: 'new-order', slug: 'new' }] });

            const shortcut = this.service.getHeaderMenuItems().find((i) => i._isShortcut);
            assert.strictEqual(shortcut.id, 'new-order');
            assert.strictEqual(shortcut.slug, 'new');
        });

        test('a non-array shortcuts value is ignored', function (assert) {
            this.service.registerHeaderMenuItem('Orders', 'r', { shortcuts: 'nope' });

            assert.strictEqual(this.service.getHeaderMenuItems().length, 1);
        });
    });

    module('onClick wrapping', function () {
        test('a handler is called with the item and the universe', function (assert) {
            const calls = [];
            const universe = this.owner.lookup('service:universe');

            this.service.registerHeaderMenuItem({ title: 'Orders', slug: 'orders', onClick: (...args) => calls.push(args) });
            this.service.getHeaderMenuItems()[0].onClick();

            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0][0].title, 'Orders', 'the menu item is passed first');
            assert.strictEqual(calls[0][1], universe, 'then the universe service');
        });

        test('a non-function onClick is left alone', function (assert) {
            this.service.registerHeaderMenuItem({ title: 'Orders', slug: 'orders', onClick: 'not a function' });

            assert.strictEqual(this.service.getHeaderMenuItems()[0].onClick, 'not a function');
        });

        test('passing onClick as an option to the string form throws', function (assert) {
            // Pinned, not fixed. MenuItem declares an `onClick(handler)` chaining
            // method, but its constructor also assigns `this.onClick = null`,
            // which shadows the method on every instance. The normalizer calls
            // `menuItem.onClick(handler)` for this option, so the documented
            // string-plus-options form is unusable for click handlers — an
            // object literal is the only route that works today.
            assert.throws(() => this.service.registerHeaderMenuItem('Orders', 'r', { onClick: () => {} }), /not a function/);
        });
    });

    module('admin menus', function () {
        test('an admin item is registered and read back', function (assert) {
            this.service.registerAdminMenuItem('Branding', 'console.admin.branding');

            assert.deepEqual(
                this.service.getAdminMenuItems().map((i) => i.title),
                ['Branding']
            );
        });

        test('a panel is registered with its slug', function (assert) {
            this.service.registerAdminMenuPanel('Fleet Ops', [{ title: 'Navigator App', slug: 'navigator-app' }]);

            const [panel] = this.service.getAdminMenuPanels();
            assert.strictEqual(panel.title, 'Fleet Ops');
            assert.strictEqual(panel.slug, 'fleet-ops');
        });

        test('panel items are re-keyed so the panel slug drives the URL', function (assert) {
            this.service.registerAdminMenuPanel('Fleet Ops', [{ title: 'Navigator App', slug: 'navigator-app' }]);

            const [item] = this.service.getMenuItemsFromPanel('fleet-ops');
            assert.strictEqual(item.slug, 'fleet-ops', 'the panel slug is used in the URL');
            assert.strictEqual(item.view, 'navigator-app', 'the item slug becomes the view query param');
        });

        test('panel items are excluded from the plain admin item list', function (assert) {
            this.service.registerAdminMenuItem('Branding', 'r');
            this.service.registerAdminMenuPanel('Fleet Ops', [{ title: 'Navigator App', slug: 'navigator-app' }]);

            assert.deepEqual(
                this.service.getAdminMenuItems().map((i) => i.title),
                ['Branding'],
                'panel members would otherwise appear twice in the UI'
            );
        });

        test('panels are sorted by priority', function (assert) {
            this.service.registerAdminMenuPanel('Second', [], { priority: 10 });
            this.service.registerAdminMenuPanel('First', [], { priority: 1 });

            assert.deepEqual(
                this.service.getAdminMenuPanels().map((p) => p.title),
                ['First', 'Second']
            );
        });

        test('getAdminPanels is an alias', function (assert) {
            this.service.registerAdminMenuPanel('Fleet Ops');

            assert.deepEqual(this.service.getAdminPanels(), this.service.getAdminMenuPanels());
        });

        test('an unknown panel slug yields no items', function (assert) {
            assert.deepEqual(this.service.getMenuItemsFromPanel('nope'), []);
        });

        test('the computed getters mirror the methods', function (assert) {
            this.service.registerAdminMenuItem('Branding', 'r');
            this.service.registerAdminMenuPanel('Fleet Ops');

            assert.deepEqual(this.service.adminMenuItems, this.service.getAdminMenuItems());
            assert.deepEqual(this.service.adminMenuPanels, this.service.getAdminMenuPanels());
        });
    });

    module('account menus', function () {
        test('an organization item defaults to the settings section', function (assert) {
            this.service.registerOrganizationMenuItem('Billing');

            const [item] = this.service.getOrganizationMenuItems();
            assert.strictEqual(item.title, 'Billing');
            assert.strictEqual(item.section, 'settings');
        });

        test('a user item defaults to the account section', function (assert) {
            this.service.registerUserMenuItem('Profile');

            const [item] = this.service.getUserMenuItems();
            assert.strictEqual(item.section, 'account');
        });

        test('an explicit section is respected', function (assert) {
            this.service.registerOrganizationMenuItem('Billing', { section: 'finance' });

            assert.strictEqual(this.service.getOrganizationMenuItems()[0].section, 'finance');
        });

        test('both default to the virtual route', function (assert) {
            this.service.registerOrganizationMenuItem('Billing');
            this.service.registerUserMenuItem('Profile');

            assert.strictEqual(this.service.getOrganizationMenuItems()[0].route, 'console.virtual');
            assert.strictEqual(this.service.getUserMenuItems()[0].route, 'console.virtual');
        });

        test('an explicit route is respected', function (assert) {
            this.service.registerUserMenuItem('Profile', { route: 'console.profile' });

            assert.strictEqual(this.service.getUserMenuItems()[0].route, 'console.profile');
        });

        test('organization and user items share a registry but not a section', function (assert) {
            this.service.registerOrganizationMenuItem('Billing');
            this.service.registerUserMenuItem('Profile');

            assert.deepEqual(
                this.service.getOrganizationMenuItems().map((i) => i.title),
                ['Billing']
            );
            assert.deepEqual(
                this.service.getUserMenuItems().map((i) => i.title),
                ['Profile']
            );
        });

        test('the computed getters mirror the methods', function (assert) {
            this.service.registerOrganizationMenuItem('Billing');
            this.service.registerUserMenuItem('Profile');

            assert.deepEqual(this.service.organizationMenuItems, this.service.getOrganizationMenuItems());
            assert.deepEqual(this.service.userMenuItems, this.service.getUserMenuItems());
        });
    });

    module('settings menus', function () {
        test('a settings item is registered and read back', function (assert) {
            this.service.registerSettingsMenuItem('Notifications');

            assert.deepEqual(
                this.service.getSettingsMenuItems().map((i) => i.title),
                ['Notifications']
            );
        });

        test('settings panels are sorted by priority', function (assert) {
            this.registry.register('console:settings', 'menu-panel', 'b', { title: 'Second', priority: 10 });
            this.registry.register('console:settings', 'menu-panel', 'a', { title: 'First', priority: 1 });

            assert.deepEqual(
                this.service.getSettingsMenuPanels().map((p) => p.title),
                ['First', 'Second']
            );
        });

        test('the computed getters mirror the methods', function (assert) {
            this.service.registerSettingsMenuItem('Notifications');

            assert.deepEqual(this.service.settingsMenuItems, this.service.getSettingsMenuItems());
            assert.deepEqual(this.service.settingsMenuPanels, this.service.getSettingsMenuPanels());
        });
    });

    module('generic registry access', function () {
        test('an item can be registered into any named registry', function (assert) {
            this.service.registerMenuItem('engine:fleet-ops', 'Orders', { route: 'console.orders' });

            assert.deepEqual(
                this.service.getMenuItems('engine:fleet-ops').map((i) => i.title),
                ['Orders']
            );
        });

        test('an unknown registry is empty rather than an error', function (assert) {
            assert.deepEqual(this.service.getMenuItems('engine:nope'), []);
            assert.deepEqual(this.service.getMenuPanels('engine:nope'), []);
        });

        test('lookupMenuItem finds by slug', function (assert) {
            this.service.registerMenuItem('engine:fleet-ops', 'Orders', { route: 'r' });

            assert.strictEqual(this.service.lookupMenuItem('engine:fleet-ops', 'orders').title, 'Orders');
        });

        test('a view and section narrow the lookup', function (assert) {
            this.registry.register('engine:x', 'menu-item', 'a', { slug: 'shared', view: 'one', section: 'left', title: 'One' });
            this.registry.register('engine:x', 'menu-item', 'b', { slug: 'shared', view: 'two', section: 'right', title: 'Two' });

            assert.strictEqual(this.service.lookupMenuItem('engine:x', 'shared', 'two').title, 'Two');
            assert.strictEqual(this.service.lookupMenuItem('engine:x', 'shared', null, 'left').title, 'One');
        });

        test('a lookup that matches nothing is undefined', function (assert) {
            assert.strictEqual(this.service.lookupMenuItem('engine:nope', 'orders'), undefined);
        });

        test('getMenuItem is an alias for lookupMenuItem', function (assert) {
            this.service.registerMenuItem('engine:fleet-ops', 'Orders', { route: 'r' });

            assert.strictEqual(this.service.getMenuItem('engine:fleet-ops', 'orders'), this.service.lookupMenuItem('engine:fleet-ops', 'orders'));
        });
    });

    test('setApplicationInstance records the application', function (assert) {
        const application = {};

        this.service.setApplicationInstance(application);

        assert.strictEqual(this.service.applicationInstance, application);
    });
});

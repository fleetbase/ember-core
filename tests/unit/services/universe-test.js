import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { setupUniverseRegistryStubs } from 'dummy/tests/helpers/universe-registry-stubs';
import { MenuItem, MenuPanel } from '@fleetbase/ember-core/contracts';

module('Unit | Service | universe', function (hooks) {
    setupTest(hooks);
    setupUniverseRegistryStubs(hooks);

    hooks.beforeEach(function () {
        this.universe = this.owner.lookup('service:universe');
        this.owner.lookup('service:universe/registry-service').clearAll();
    });

    test('it exists', function (assert) {
        assert.ok(this.universe);
    });

    test('the registry facade reads and writes the menu-item list by default', function (assert) {
        this.universe.registerInRegistry('acme:things', 'one', { id: 'one', label: 'One' });
        this.universe.registerInRegistry('acme:things', 'two', { id: 'two' }, 'widgets');

        assert.deepEqual(
            this.universe.getRegistry('acme:things').map((item) => item.id),
            ['one']
        );
        assert.deepEqual(
            this.universe.getRegistry('acme:things', 'widgets').map((item) => item.id),
            ['two']
        );
        assert.strictEqual(this.universe.lookupFromRegistry('acme:things', 'one').label, 'One');
        assert.strictEqual(this.universe.lookupFromRegistry('acme:things', 'two', 'widgets').id, 'two');
        assert.strictEqual(this.universe.lookupFromRegistry('acme:things', 'missing'), null);
    });

    test('the menu facade returns registered menu items and panels', function (assert) {
        const menuService = this.owner.lookup('service:universe/menu-service');
        menuService.registerMenuItem('component:acme-panel', new MenuItem({ title: 'Tab', slug: 'tab' }));
        this.owner.lookup('service:universe/registry-service').register('component:acme-panel', 'menu-panel', 'panel', new MenuPanel({ title: 'Panel', slug: 'panel' }));

        assert.deepEqual(
            this.universe.getMenuItemsFromRegistry('component:acme-panel').map((item) => item.slug),
            ['tab']
        );
        assert.strictEqual(this.universe.getMenuPanelsFromRegistry('component:acme-panel').length, 1);
        assert.strictEqual(this.universe.lookupMenuItemFromRegistry('component:acme-panel', 'tab').slug, 'tab');
        assert.deepEqual(this.universe.getMenuItemsFromRegistry('component:unknown').length, 0);
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { setupUniverseRegistryStubs } from 'dummy/tests/helpers/universe-registry-stubs';
import { TableColumn, ResourceAction, ActionButton } from '@fleetbase/ember-core/contracts';

module('Unit | Service | universe (resource view facade)', function (hooks) {
    setupTest(hooks);
    setupUniverseRegistryStubs(hooks);

    hooks.beforeEach(function () {
        this.universe = this.owner.lookup('service:universe');
        this.owner.lookup('service:universe/registry-service').clearAll();
    });

    test('the resource view facade delegates to the resource view service', function (assert) {
        const views = this.owner.lookup('service:universe/resource-view-service');

        assert.true(this.universe.registerInResourceView('fleet-ops:table:driver:columns', new TableColumn({ id: 'a' })));
        assert.true(this.universe.registerTableColumn('fleet-ops', 'driver', new TableColumn({ id: 'b' })));
        assert.true(this.universe.registerRowAction('fleet-ops', 'driver', new ResourceAction({ id: 'c' })));
        assert.true(this.universe.registerBulkAction('fleet-ops', 'driver', new ResourceAction({ id: 'd' })));
        assert.true(this.universe.registerTableAction('fleet-ops', 'driver', new ActionButton({ id: 'e' })));
        assert.true(this.universe.registerDetailsAction('fleet-ops', 'driver', new ActionButton({ id: 'f' })));
        assert.true(this.universe.registerDetailsMenuItem('fleet-ops', 'driver', new ResourceAction({ id: 'g' })));

        const found = views.resourceRegistryNames('fleet-ops', 'driver').flatMap((name) => views.get(name).map((item) => item.id));
        assert.deepEqual(found, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    });
});

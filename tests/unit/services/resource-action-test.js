import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from 'dummy/tests/helpers';
import { setupUniverseRegistryStubs } from 'dummy/tests/helpers/universe-registry-stubs';

module('Unit | Service | resource-action', function (hooks) {
    setupTest(hooks);
    setupUniverseRegistryStubs(hooks);

    hooks.beforeEach(function () {
        // Provided by @fleetbase/ember-ui in a real console, which this addon's dummy app lacks.
        this.owner.register('service:modals-manager', class extends Service {});
        this.owner.register('service:resource-context-panel', class extends Service {});
        // Their modules import ember-ui and `fetch`, which the dummy app cannot resolve.
        this.owner.register('service:crud', class extends Service {});
        this.owner.register('service:fetch', class extends Service {});
        this.owner.lookup('service:universe/registry-service').clearAll();
    });

    test('it exists', function (assert) {
        let service = this.owner.lookup('service:resource-action');
        assert.ok(service);
    });

    test('it derives registry names from the mount prefix and model name', function (assert) {
        const service = this.owner.lookup('service:resource-action');
        assert.strictEqual(service.tableRegistry, null, 'no registry before initialize');
        assert.strictEqual(service.detailsRegistry, null);

        service.initialize('driver');
        assert.strictEqual(service.registryExtension, 'fleet-ops');
        assert.strictEqual(service.tableRegistry, 'fleet-ops:table:driver');
        assert.strictEqual(service.detailsRegistry, 'fleet-ops:details:driver');

        service.initialize('ledger-invoice', { permissionPrefix: 'ledger', mountPrefix: 'console.ledger' });
        assert.strictEqual(service.tableRegistry, 'ledger:table:invoice', 'the engine prefix is stripped from the model name');

        service.initialize('api-credential', { permissionPrefix: 'developers', mountPrefix: 'console.developers', registryResource: 'api-key' });
        assert.strictEqual(service.detailsRegistry, 'developers:details:api-key');

        service.initialize('contact', { registryExtension: 'acme', registryResource: 'customer' });
        assert.strictEqual(service.tableRegistry, 'acme:table:customer');

        service.initialize(undefined);
        assert.strictEqual(service.tableRegistry, null);
    });

    test('mergeRegistered merges into the resource slot', function (assert) {
        const service = this.owner.lookup('service:resource-action');
        const views = this.owner.lookup('service:universe/resource-view-service');
        const base = [{ id: 'edit' }];

        assert.strictEqual(service.mergeRegistered('details', 'actions', base), base, 'unchanged before initialize');

        service.initialize('driver');
        views.register('fleet-ops:details:driver:actions', { id: 'print' });
        views.register('fleet-ops:table:driver:actions', { id: 'import' });

        assert.deepEqual(
            service.mergeRegistered('details', 'actions', base).map((b) => b.id),
            ['edit', 'print']
        );
        assert.deepEqual(
            service.mergeRegistered('table', 'actions').map((b) => b.id),
            ['import']
        );
    });

    test('mergeRegisteredColumns merges columns and row actions', function (assert) {
        const service = this.owner.lookup('service:resource-action');
        const views = this.owner.lookup('service:universe/resource-view-service');
        const columns = [{ id: 'name' }, { cellComponent: 'table/cell/dropdown', actions: [{ id: 'view' }] }];

        assert.strictEqual(service.mergeRegisteredColumns(columns), columns, 'unchanged before initialize');

        service.initialize('vehicle');
        views.register('fleet-ops:table:vehicle:columns', { id: 'score' });
        views.register('fleet-ops:table:vehicle:row-actions', { id: 'ping' });

        const merged = service.mergeRegisteredColumns(columns);
        assert.deepEqual(
            merged.map((column) => column.id),
            ['name', 'score', undefined]
        );
        assert.deepEqual(
            merged[2].actions.map((action) => action.id),
            ['view', 'ping']
        );
        assert.deepEqual(service.mergeRegisteredColumns().length, 1, 'defaults to no built-in columns');
    });

    test('mergeRegistered leaves items alone without the registry service', function (assert) {
        const service = this.owner.lookup('service:resource-action');
        service.initialize('driver');
        // An engine built against an older ember-core has no such service.
        Object.defineProperty(service, 'resourceView', { value: null });
        const base = [{ id: 'edit' }];
        assert.strictEqual(service.mergeRegistered('details', 'actions', base), base);
        assert.strictEqual(service.mergeRegisteredColumns(base), base);
    });
});

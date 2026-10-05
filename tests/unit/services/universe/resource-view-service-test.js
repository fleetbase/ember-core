import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { setupUniverseRegistryStubs } from 'dummy/tests/helpers/universe-registry-stubs';
import Service from '@ember/service';
import { A } from '@ember/array';
import { TableColumn, ResourceAction, ActionButton, MenuItem } from '@fleetbase/ember-core/contracts';

module('Unit | Service | universe/resource-view-service', function (hooks) {
    setupTest(hooks);
    setupUniverseRegistryStubs(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:universe/resource-view-service');
        this.registry = this.owner.lookup('service:universe/registry-service');
        this.registry.clearAll();
    });

    test('it is reachable through universe.getService', function (assert) {
        const universe = this.owner.lookup('service:universe');
        ['resource-view', 'resourceView', 'resource-views', 'resource-view-service', 'universe/resource-view-service'].forEach((name) => {
            assert.strictEqual(universe.getService(name), this.service, name);
        });
    });

    test('it stores items under the full name, in the list named after the contract', function (assert) {
        assert.true(this.service.register('fleet-ops:driver:table:columns', new TableColumn({ id: 'score', label: 'Score' })));
        assert.true(this.service.register('fleet-ops:driver:table:row-actions', [new ResourceAction({ id: 'a' }), { id: 'b', label: 'Plain' }]));
        assert.true(this.service.register('fleet-ops:driver:details:actions', new ActionButton({ id: 'c' })));

        assert.strictEqual(this.registry.getRegistry('fleet-ops:driver:table:columns', 'table-column')[0].label, 'Score');
        assert.deepEqual(
            this.registry.getRegistry('fleet-ops:driver:table:row-actions', 'action').map((item) => item.id),
            ['a', 'b']
        );
        assert.strictEqual(this.registry.getRegistry('fleet-ops:driver:details:actions', 'action-button')[0]._contractType, 'action-button');
        assert.strictEqual(this.service.get('fleet-ops:driver:table:row-actions')[1]._contractType, 'action', 'plain objects are tagged too');
    });

    test('re-registering an id replaces the item', function (assert) {
        this.service.register('ledger:invoice:table:columns', { id: 'po', label: 'PO' });
        this.service.register('ledger:invoice:table:columns', { id: 'po', label: 'Purchase Order' });
        assert.deepEqual(
            this.service.get('ledger:invoice:table:columns').map((item) => item.label),
            ['Purchase Order']
        );
    });

    test('it rejects bad names, missing ids and contracts in the wrong slot', function (assert) {
        assert.false(this.service.register('fleet-ops:component:driver:details', { id: 'x' }), 'invalid name');
        assert.false(this.service.register('fleet-ops:driver:table:columns', { label: 'no id' }), 'missing id');
        assert.false(this.service.register('fleet-ops:driver:table:columns', 'nope'), 'not an object');
        assert.false(this.service.register('fleet-ops:driver:table:columns', new ResourceAction({ id: 'x' })), 'action in the columns slot');
        assert.false(this.service.register('fleet-ops:driver:table:row-actions', [new ResourceAction({ id: 'ok' }), new ActionButton({ id: 'bad' })]), 'one bad item fails the batch');
        assert.deepEqual(
            this.service.get('fleet-ops:driver:table:row-actions').map((item) => item.id),
            ['ok'],
            'the valid items of a batch are still registered'
        );
        assert.deepEqual(this.service.get('fleet-ops:driver:table:columns'), []);
        assert.deepEqual(this.service.get('not-a-name'), []);
    });

    test('the sugar methods build the right names', function (assert) {
        this.service.registerTableColumn('iam', 'user', new TableColumn({ id: 'col' }));
        this.service.registerRowAction('iam', 'user', new ResourceAction({ id: 'row' }));
        this.service.registerBulkAction('iam', 'user', new ResourceAction({ id: 'bulk' }));
        this.service.registerTableAction('iam', 'user', new ActionButton({ id: 'toolbar' }));
        this.service.registerDetailsAction('iam', 'user', new ActionButton({ id: 'header' }));
        this.service.registerDetailsMenuItem('iam', 'user', new ResourceAction({ id: 'menu' }));
        this.service.registerDetailsTab('iam', 'user', new MenuItem({ title: 'Audit', slug: 'audit' }));

        const found = this.service.resourceRegistryNames('iam', 'user').map((name) => this.service.get(name).map((item) => item.id ?? item.slug));
        assert.deepEqual(found, [['col'], ['row'], ['bulk'], ['toolbar'], ['header'], ['menu'], ['audit']]);
    });

    test('details tabs go to the legacy tab registry', function (assert) {
        assert.true(this.service.registerDetailsTab('fleet-ops', 'driver', new MenuItem({ title: 'Safety', slug: 'safety' })));
        const menuService = this.owner.lookup('service:universe/menu-service');
        assert.strictEqual(menuService.getMenuItems('fleet-ops:component:driver:details')[0].slug, 'safety');
    });

    test('the tabs alias reads and writes the legacy tab registry', function (assert) {
        const menuService = this.owner.lookup('service:universe/menu-service');

        assert.true(this.service.register('fleet-ops:driver:details:tabs', new MenuItem({ title: 'Safety', slug: 'safety' })));
        assert.true(this.service.register('fleet-ops:driver:details:tabs', { title: 'Coaching', slug: 'coaching' }), 'a plain menu item object works too');
        menuService.registerMenuItem('fleet-ops:component:driver:details', new MenuItem({ title: 'Legacy', slug: 'legacy' }));

        assert.deepEqual(
            this.service.get('fleet-ops:driver:details:tabs').map((tab) => tab.slug),
            ['safety', 'coaching', 'legacy'],
            'both names reach the same tabs'
        );

        assert.true(this.service.unregister('fleet-ops:driver:details:tabs', 'legacy'));
        assert.deepEqual(
            menuService.getMenuItems('fleet-ops:component:driver:details').map((tab) => tab.slug),
            ['safety', 'coaching']
        );
    });

    test('the tabs alias only accepts menu items', function (assert) {
        assert.false(this.service.register('fleet-ops:driver:details:tabs', 'not a tab'));
        assert.deepEqual(this.service.get('fleet-ops:driver:details:tabs').length, 0);
    });

    test('declare creates every registry for a resource', function (assert) {
        const names = this.service.declare('storefront', ['order', 'customer']);
        assert.strictEqual(names.length, 14);
        assert.true(this.registry.hasList('storefront:component:order:details', 'menu-item'), 'the tabs alias declares the legacy tab registry');
        assert.true(this.registry.hasList('storefront:order:table:columns', 'table-column'));
        assert.true(this.registry.hasList('storefront:customer:details:menu', 'action'));
        assert.deepEqual(this.service.declare('storefront'), []);
    });

    test('unregister removes an item', function (assert) {
        this.service.register('ledger:invoice:details:menu', new ResourceAction({ id: 'print' }));
        assert.false(this.service.unregister('ledger:invoice:details:menu', 'missing'));
        assert.false(this.service.unregister('bad-name', 'print'));
        assert.true(this.service.unregister('ledger:invoice:details:menu', 'print'));
        assert.deepEqual(this.service.get('ledger:invoice:details:menu').length, 0);
    });

    test('merge adds the view context and returns the base untouched when nothing is registered', function (assert) {
        const base = [{ id: 'view' }];
        assert.deepEqual(this.service.merge('fleet-ops:driver:table:row-actions', base), base);
        assert.deepEqual(this.service.merge('invalid', base), base);
        assert.deepEqual(this.service.merge('invalid'), []);
        assert.deepEqual(this.service.merge('fleet-ops:driver:table:row-actions', null), []);
        assert.deepEqual(this.service.merge('fleet-ops:driver:table:row-actions', A([{ id: 'view' }])), [{ id: 'view' }], 'an Ember array comes back as a plain one');

        let received;
        this.service.register('fleet-ops:driver:table:row-actions', { id: 'sync', fn: (row, ctx) => (received = ctx) });
        const merged = this.service.merge('fleet-ops:driver:table:row-actions', base, { controller: 'ctl' });
        merged[1].fn({ id: 1 });

        assert.strictEqual(received.registry, 'fleet-ops:driver:table:row-actions');
        assert.strictEqual(received.extension, 'fleet-ops');
        assert.strictEqual(received.surface, 'table');
        assert.strictEqual(received.resourceName, 'driver');
        assert.strictEqual(received.slot, 'row-actions');
        assert.strictEqual(received.controller, 'ctl');
        assert.strictEqual(received.owner, this.owner);
    });

    test('merge keeps context getters lazy', function (assert) {
        let reads = 0;
        const context = {
            get table() {
                reads++;
                return 'table';
            },
        };

        let received;
        this.service.register('fleet-ops:driver:table:row-actions', { id: 'sync', fn: (row, ctx) => (received = ctx) });
        const [action] = this.service.merge('fleet-ops:driver:table:row-actions', [], context);

        assert.strictEqual(reads, 0, 'merging does not read the getter');
        action.fn({});
        assert.strictEqual(received.table, 'table');
        assert.strictEqual(reads, 1, 'the handler reads it when it runs');
    });

    test('merge drops columns the user cannot access', function (assert) {
        this.owner.register(
            'service:abilities',
            class extends Service {
                can(permission) {
                    return permission !== 'acme hidden';
                }
            }
        );
        this.service.register('fleet-ops:driver:table:columns', [
            { id: 'shown', permission: 'acme shown' },
            { id: 'hidden', permission: 'acme hidden' },
        ]);
        assert.deepEqual(
            this.service.merge('fleet-ops:driver:table:columns', []).map((column) => column.id),
            ['shown']
        );
    });

    test('mergeSlot addresses a slot by its surface prefix', function (assert) {
        this.service.register('ledger:invoice:details:actions', { id: 'print' });
        assert.deepEqual(
            this.service.mergeSlot('ledger:invoice:details', 'actions', [{ id: 'edit' }]).map((b) => b.id),
            ['edit', 'print']
        );
        assert.deepEqual(this.service.mergeSlot('bad', 'actions', [{ id: 'edit' }]), [{ id: 'edit' }]);
        assert.deepEqual(
            this.service.mergeSlot('ledger:invoice:details', 'actions').map((b) => b.id),
            ['print'],
            'the built-in items are optional'
        );
    });

    test('mergeRowActions merges into the dropdown column only', function (assert) {
        const columns = [{ id: 'name' }, { cellComponent: 'table/cell/dropdown', actions: [{ id: 'view' }] }, { cellComponent: 'table/cell/dropdown' }];
        assert.deepEqual(this.service.mergeRowActions('fleet-ops:driver:table', columns), columns, 'unchanged when nothing is registered');
        assert.deepEqual(this.service.mergeRowActions('bad', columns), columns);

        this.service.register('fleet-ops:driver:table:row-actions', { id: 'sync' });
        assert.deepEqual(this.service.mergeRowActions('fleet-ops:driver:table'), [], 'the columns are optional');
        const merged = this.service.mergeRowActions('fleet-ops:driver:table', columns);
        assert.strictEqual(merged[0], columns[0]);
        assert.deepEqual(
            merged[1].actions.map((a) => a.id),
            ['view', 'sync']
        );
        assert.deepEqual(
            merged[2].actions.map((a) => a.id),
            ['sync']
        );
        assert.deepEqual(
            columns[1].actions.map((a) => a.id),
            ['view'],
            'the original column is untouched'
        );
    });

    test('queryParamsFor adds the params of filterable registered columns', function (assert) {
        this.service.register('fleet-ops:driver:table:columns', [
            new TableColumn({ id: 'score' }).withFilter('safety_score'),
            new TableColumn({ id: 'dup' }).withFilter('status'),
            { id: 'not-filterable', filterParam: 'ignored' },
        ]);

        assert.deepEqual(this.service.queryParamsFor('fleet-ops', 'driver', ['page', 'status']), ['page', 'status', 'safety_score']);
        assert.deepEqual(this.service.queryParamsFor('fleet-ops', 'vehicle'), []);

        // Registered after the controller read its params: still stored, but warned about.
        assert.true(this.service.register('fleet-ops:driver:table:columns', new TableColumn({ id: 'late' }).withFilter('late_param')));
    });
});

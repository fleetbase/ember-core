import { module, test } from 'qunit';
import { TableColumn, ResourceAction, ActionButton, ExtensionComponent } from '@fleetbase/ember-core/contracts';

module('Unit | Contracts | resource view items', function () {
    test('every item requires an id', function (assert) {
        assert.throws(() => new TableColumn({ label: 'No id' }), /TableColumn requires an id/);
        assert.throws(() => new ResourceAction(), /ResourceAction requires an id/);
        assert.throws(() => new ActionButton('not-an-object'), /ActionButton requires an id/);
    });

    test('a table column keeps every key and defaults to unsortable', function (assert) {
        const cell = new ExtensionComponent('@acme/engine', 'cell/score');
        const column = new TableColumn({ id: 'score', label: 'Score', valuePath: 'meta.score', width: 90 })
            .withCellComponent(cell)
            .withLabel('Safety Score')
            .withValuePath('meta.safety_score')
            .withFilter('safety_score', 'filter/string', { filterLabel: 'Safety' })
            .after('status')
            .withPriority(2)
            .withPermission('acme view score');

        assert.deepEqual(column.toObject(), {
            id: 'score',
            label: 'Safety Score',
            valuePath: 'meta.safety_score',
            width: 90,
            sortable: false,
            resizable: true,
            cellComponent: cell,
            filterable: true,
            filterParam: 'safety_score',
            filterComponent: 'filter/string',
            filterLabel: 'Safety',
            after: 'status',
            priority: 2,
            permission: 'acme view score',
            _contractType: 'table-column',
        });
        assert.strictEqual(column.filterParam, 'safety_score');
        assert.strictEqual(new TableColumn({ id: 'x', filterParam: 'x' }).filterParam, null, 'a param without filterable is not a filter');
        assert.true(new TableColumn({ id: 'x', sortable: true }).toObject().sortable, 'sortable can be opted into');
    });

    test('before and after are mutually exclusive', function (assert) {
        const action = new ResourceAction({ id: 'a' }).after('view').before('delete');
        assert.strictEqual(action.getOption('before'), 'delete');
        assert.false(action.hasOption('after'));
        action.after('edit');
        assert.false(action.hasOption('before'));
        assert.strictEqual(action.withIndex(3).getOption('index'), 3);
    });

    test('an action builds its handler, icon and visibility', function (assert) {
        const fn = () => {};
        const isVisible = () => true;
        const action = new ResourceAction({ id: 'sync' }).withLabel('Sync').withIcon('sync', 'fas').withHandler(fn).visibleWhen(isVisible);
        assert.deepEqual(action.toObject(), { id: 'sync', label: 'Sync', icon: 'sync', iconPrefix: 'fas', fn, isVisible, _contractType: 'action' });
        assert.strictEqual(new ResourceAction({ id: 'x' }).withIcon('bolt').getOption('iconPrefix'), null);
    });

    test('a button builds its handler, items and component', function (assert) {
        const onClick = () => {};
        const isVisible = () => true;
        const child = new ResourceAction({ id: 'child', label: 'Child' });
        const button = new ActionButton({ id: 'import' })
            .withText('Import')
            .withIcon('download', 'fas')
            .withHandler(onClick)
            .withItems([child, { id: 'plain', label: 'Plain' }])
            .withComponent('acme/button')
            .visibleWhen(isVisible);

        assert.deepEqual(button.toObject(), {
            id: 'import',
            text: 'Import',
            icon: 'download',
            iconPrefix: 'fas',
            onClick,
            items: [
                { id: 'child', label: 'Child', _contractType: 'action' },
                { id: 'plain', label: 'Plain' },
            ],
            component: 'acme/button',
            isVisible,
            _contractType: 'action-button',
        });
        assert.strictEqual(new ActionButton({ id: 'x' }).withIcon('bolt').getOption('iconPrefix'), null);
        assert.deepEqual(new ActionButton({ id: 'x' }).withItems().getOption('items'), []);
    });
});

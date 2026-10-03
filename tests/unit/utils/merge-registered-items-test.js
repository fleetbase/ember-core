import { module, test } from 'qunit';
import mergeRegisteredItems from '@fleetbase/ember-core/utils/merge-registered-items';
import { A } from '@ember/array';

const ids = (items) => items.map((item) => item.id ?? (item.separator ? '---' : item.label));

module('Unit | Utility | merge-registered-items', function () {
    test('it returns the base items when nothing is registered', function (assert) {
        const base = [{ id: 'a' }];
        const merged = mergeRegisteredItems(base);
        assert.deepEqual(merged, base);
        assert.notStrictEqual(merged, base, 'the base array is not modified in place');
        assert.deepEqual(mergeRegisteredItems(null, null), []);
        assert.deepEqual(mergeRegisteredItems(A([{ id: 'a' }]), A([{ id: 'b' }])).length, 2, 'Ember arrays are accepted');
    });

    test('columns default to just before the row-actions column', function (assert) {
        const base = [{ id: 'name' }, { id: 'status' }, { label: '', cellComponent: 'table/cell/dropdown' }];
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'score' }], { slot: 'columns' })), ['name', 'status', 'score', '']);

        const sticky = [{ id: 'name' }, { id: 'menu', sticky: 'right' }];
        assert.deepEqual(ids(mergeRegisteredItems(sticky, [{ id: 'score' }], { slot: 'columns' })), ['name', 'score', 'menu']);
        assert.deepEqual(ids(mergeRegisteredItems([{ id: 'name' }], [{ id: 'score' }], { slot: 'columns' })), ['name', 'score']);
    });

    test('row actions and menu items default to before delete, keeping its separator', function (assert) {
        const base = [{ id: 'view' }, { separator: true }, { id: 'delete' }];
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'sync' }], { slot: 'row-actions' })), ['view', 'sync', '---', 'delete']);
        assert.deepEqual(ids(mergeRegisteredItems([{ id: 'delete' }], [{ id: 'sync' }], { slot: 'menu', context: {} })), ['sync', 'delete']);
        assert.deepEqual(ids(mergeRegisteredItems([{ id: 'view' }, { id: 'delete' }], [{ id: 'sync' }], { slot: 'row-actions' })), ['view', 'sync', 'delete']);
        assert.deepEqual(ids(mergeRegisteredItems([{ id: 'view' }], [{ id: 'sync' }], { slot: 'row-actions' })), ['view', 'sync']);
        assert.deepEqual(ids(mergeRegisteredItems([{ id: 'view' }], [{ id: 'sync' }], { slot: 'bulk-actions' })), ['view', 'sync'], 'other slots append');
    });

    test('anchors win over index, index over the default, and missing anchors fall through', function (assert) {
        const base = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'x', before: 'b' }])), ['a', 'x', 'b', 'c']);
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'x', after: 'a' }])), ['a', 'x', 'b', 'c']);
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'x', index: 0 }])), ['x', 'a', 'b', 'c']);
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'x', index: 99 }])), ['a', 'b', 'c', 'x'], 'index is clamped');
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'x', index: -4 }])), ['x', 'a', 'b', 'c']);
        assert.deepEqual(ids(mergeRegisteredItems(base, [{ id: 'x', before: 'nope', after: 'nope', index: 1 }])), ['a', 'x', 'b', 'c']);
        assert.deepEqual(
            ids(
                mergeRegisteredItems(base, [
                    { id: 'x', after: 'y' },
                    { id: 'y', priority: 1 },
                ])
            ),
            ['a', 'b', 'c', 'y', 'x'],
            'registered items can anchor to each other'
        );
    });

    test('it orders by priority, then registration order', function (assert) {
        const merged = mergeRegisteredItems([], [{ id: 'late', priority: 20 }, { id: 'first' }, { id: 'early', priority: '1' }, { id: 'second', priority: 'nope' }]);
        assert.deepEqual(ids(merged), ['early', 'first', 'second', 'late']);
    });

    test('built-ins win id collisions, and items without an id are skipped', function (assert) {
        const merged = mergeRegisteredItems([{ id: 'edit', label: 'Built-in' }], [{ id: 'edit', label: 'Registered' }, { label: 'No id' }, null]);
        assert.deepEqual(merged, [{ id: 'edit', label: 'Built-in' }]);
    });

    test('registered items are copies', function (assert) {
        const registered = { id: 'score', label: 'Score' };
        const [copy] = mergeRegisteredItems([], [registered], { slot: 'columns' });
        copy.hidden = true;
        assert.deepEqual(registered, { id: 'score', label: 'Score' }, 'mutating the merged column leaves the registry alone');
    });

    test('columns failing their permission are left out', function (assert) {
        const canAccess = (permission) => permission === 'allowed';
        const merged = mergeRegisteredItems([], [{ id: 'a', permission: 'allowed' }, { id: 'b', permission: 'denied' }, { id: 'c' }], { slot: 'columns', canAccess });
        assert.deepEqual(ids(merged), ['a', 'c']);
        assert.strictEqual(mergeRegisteredItems([], [{ id: 'b', permission: 'denied' }], { slot: 'columns' }).length, 1, 'no checker, no filtering');
        assert.strictEqual(mergeRegisteredItems([], [{ id: 'b', permission: 'denied' }], { slot: 'row-actions', canAccess }).length, 1, 'actions are disabled by the renderer, not dropped');
    });

    test('row and bulk actions receive the target then the context', function (assert) {
        const context = { registry: 'fleet-ops:table:driver:row-actions' };
        const calls = [];
        const [action] = mergeRegisteredItems([], [{ id: 'sync', fn: (...args) => calls.push(args), isVisible: (row, ctx) => row.active && ctx === context }], {
            slot: 'row-actions',
            context,
        });

        action.fn({ id: 1 }, 'extra');
        assert.deepEqual(calls, [[{ id: 1 }, context, 'extra']]);
        assert.true(action.isVisible({ active: true }));
        assert.false(action.isVisible({ active: false }));

        const [plain] = mergeRegisteredItems([], [{ id: 'label-only', label: 'x' }], { slot: 'bulk-actions', context });
        assert.deepEqual(plain, { id: 'label-only', label: 'x' });
    });

    test('bulk actions receive the selection at click time', function (assert) {
        let selection = [{ id: 1 }];
        const context = { getSelectedRows: () => selection };
        const calls = [];
        const [action] = mergeRegisteredItems([], [{ id: 'export', fn: (...args) => calls.push(args) }], { slot: 'bulk-actions', context });

        selection = [{ id: 1 }, { id: 2 }];
        action.fn('event');
        assert.deepEqual(calls, [[selection, context, 'event']]);

        const [unbound] = mergeRegisteredItems([], [{ id: 'export', fn: (...args) => calls.push(args) }], { slot: 'bulk-actions', context: {} });
        unbound.fn('rows');
        assert.deepEqual(calls[1], ['rows', {}], 'without a selection getter the first argument is the target');
    });

    test('menu items are bound to the context resource and hidden when not visible', function (assert) {
        const resource = { id: 'order-1', status: 'created' };
        const context = { resource };
        const calls = [];
        const merged = mergeRegisteredItems(
            [],
            [
                { id: 'print', fn: (...args) => calls.push(args), isVisible: (order) => order.status === 'created' },
                { id: 'void', isVisible: (order) => order.status === 'completed' },
                { id: 'plain' },
            ],
            { slot: 'menu', context }
        );

        assert.deepEqual(ids(merged), ['print', 'plain']);
        assert.false('isVisible' in merged[0], 'visibility is resolved, not passed on');
        merged[0].fn();
        assert.deepEqual(calls, [[resource, context]]);
    });

    test('header buttons receive the context and are dropped when hidden', function (assert) {
        const context = { resource: { id: 'r' } };
        const calls = [];
        const merged = mergeRegisteredItems(
            [{ id: 'refresh' }],
            [
                { id: 'hidden', isVisible: () => false },
                { id: 'import', isVisible: (ctx) => ctx === context, onClick: (...args) => calls.push(['onClick', ...args]), fn: (...args) => calls.push(['fn', ...args]) },
                {
                    id: 'more',
                    items: [
                        { id: 'one', fn: (...args) => calls.push(['one', ...args]) },
                        { id: 'two', isVisible: () => false },
                        { id: 'three', label: 'no handler' },
                    ],
                },
            ],
            { slot: 'actions', context }
        );

        assert.deepEqual(ids(merged), ['refresh', 'import', 'more']);
        assert.false('isVisible' in merged[1]);
        merged[1].onClick('event');
        merged[1].fn();
        assert.deepEqual(ids(merged[2].items), ['one', 'three']);
        merged[2].items[0].fn();
        assert.deepEqual(calls, [
            ['onClick', context, 'event'],
            ['fn', context],
            ['one', context.resource, context],
        ]);
    });
});

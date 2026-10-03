import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

module('Unit | Service | table-context', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:table-context');
    });

    test('it starts with no node or table', function (assert) {
        assert.strictEqual(this.service.node, undefined);
        assert.strictEqual(this.service.table, undefined);
    });

    test('it exposes the ids of the selected rows', function (assert) {
        this.service.table = { selectedRows: [{ id: 'a' }, { id: 'b' }] };

        assert.deepEqual(this.service.getSelectedIds(), ['a', 'b']);
    });

    test('it returns an empty list when nothing is selected', function (assert) {
        this.service.table = { selectedRows: [] };

        assert.deepEqual(this.service.getSelectedIds(), []);
        assert.deepEqual(this.service.getSelectedRows(), []);
    });

    test('it exposes the selected rows themselves', function (assert) {
        const rows = [{ id: 'a', name: 'A' }];
        this.service.table = { selectedRows: rows };

        assert.strictEqual(this.service.getSelectedRows(), rows);
    });

    test('it delegates untoggleSelectAll to the table', function (assert) {
        let called = 0;
        this.service.table = {
            selectedRows: [],
            untoggleSelectAll() {
                called++;
                return 'cleared';
            },
        };

        assert.strictEqual(this.service.untoggleSelectAll(), 'cleared');
        assert.strictEqual(called, 1);
    });

    test('it tracks the assigned node', function (assert) {
        const node = document.createElement('div');
        this.service.node = node;

        assert.strictEqual(this.service.node, node);
    });
});

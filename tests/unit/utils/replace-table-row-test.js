import replaceTableRow from 'dummy/utils/replace-table-row';
import { module, test } from 'qunit';

function fakeTable(rows) {
    return {
        rows: { content: rows },
        removed: [],
        inserted: [],
        removeRowAt(index) {
            this.removed.push(index);
            this.rows.content.splice(index, 1);
        },
        insertRowAt(index, row) {
            this.inserted.push([index, row]);
            this.rows.content.splice(index, 0, row);
        },
    };
}

module('Unit | Utility | replace-table-row', function () {
    test('it replaces a matching row found by key', function (assert) {
        const table = fakeTable([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
        const newRow = { id: 'b', updated: true };

        assert.true(replaceTableRow(table, newRow, 'id'));
        assert.deepEqual(table.removed, [1]);
        assert.strictEqual(table.rows.content[1], newRow);
    });

    test('it replaces a matching row found by predicate', function (assert) {
        const table = fakeTable([{ id: 'a' }, { id: 'b' }]);
        const newRow = { id: 'b', updated: true };

        assert.true(replaceTableRow(table, newRow, (row) => row.id === 'b'));
        assert.strictEqual(table.rows.content[1], newRow);
    });

    test('it reports no replacement when nothing matches', function (assert) {
        const table = fakeTable([{ id: 'a' }]);

        assert.false(replaceTableRow(table, { id: 'zzz' }, 'id'));
        assert.deepEqual(table.removed, [], 'no row was touched');
    });

    test('it replaces a match at index 0', function (assert) {
        const table = fakeTable([{ id: 'a' }, { id: 'b' }]);
        const newRow = { id: 'a', updated: true };

        assert.true(replaceTableRow(table, newRow, 'id'));
        assert.deepEqual(table.removed, [0]);
        assert.strictEqual(table.rows.content[0], newRow);
    });

    test('it returns false when findBy is neither a string nor a function', function (assert) {
        const table = fakeTable([{ id: 'a' }]);

        assert.false(replaceTableRow(table, { id: 'a' }, null));
    });
});

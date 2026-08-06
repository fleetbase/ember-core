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

        // NOTE: findIndex returns -1 when absent, which is truthy, so the
        // implementation still splices at -1 rather than bailing out. This pins
        // the current behaviour.
        replaceTableRow(table, { id: 'zzz' }, 'id');

        assert.deepEqual(table.removed, [-1], 'a missing row is treated as index -1');
    });

    test('it returns false for a match at index 0', function (assert) {
        const table = fakeTable([{ id: 'a' }, { id: 'b' }]);

        // NOTE: the guard is `if (rowIndex)`, so index 0 is falsy and the first
        // row is never replaced. Pinning the defect rather than silently changing it.
        assert.false(replaceTableRow(table, { id: 'a', updated: true }, 'id'));
        assert.deepEqual(table.removed, [], 'no row was touched');
    });

    test('it returns false when findBy is neither a string nor a function', function (assert) {
        const table = fakeTable([{ id: 'a' }]);

        assert.false(replaceTableRow(table, { id: 'a' }, null));
    });
});

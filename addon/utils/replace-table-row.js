import { get } from '@ember/object';

export default function replaceTableRow(table, newRow, findBy) {
    const rows = table.rows.content;
    let rowIndex = -1;
    if (typeof findBy === 'string') {
        rowIndex = rows.findIndex((row) => get(row, findBy) === get(newRow, findBy));
    } else if (typeof findBy === 'function') {
        rowIndex = rows.findIndex(findBy);
    }
    // findIndex reports a miss as -1; the first row is index 0.
    if (rowIndex >= 0) {
        table.removeRowAt(rowIndex);
        table.insertRowAt(rowIndex, newRow);
        return true;
    }
    return false;
}

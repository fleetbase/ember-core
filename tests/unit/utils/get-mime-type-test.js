import getMimeType from 'dummy/utils/get-mime-type';
import { module, test } from 'qunit';

// NOTE: despite its name the implementation returns the matched *extension*,
// not the mime type from its lookup map. These tests pin actual behavior.
module('Unit | Utility | get-mime-type', function () {
    test('it returns the matched extension for known file types', function (assert) {
        assert.strictEqual(getMimeType('report.pdf'), 'pdf');
        assert.strictEqual(getMimeType('archive.zip'), 'zip');
        assert.strictEqual(getMimeType('sheet.xlsx'), 'xlsx');
        assert.strictEqual(getMimeType('letter.docx'), 'docx');
        assert.strictEqual(getMimeType('data.csv'), 'csv');
        assert.strictEqual(getMimeType('image.png'), 'png');
    });

    test('it matches the first extension in map order', function (assert) {
        // 'doc' is checked before 'docx', so a .docx name matches 'doc' first.
        assert.strictEqual(getMimeType('letter.doc'), 'doc');
    });

    test('it returns null for unknown extensions', function (assert) {
        assert.strictEqual(getMimeType('notes.txt'), null);
        assert.strictEqual(getMimeType('no-extension'), null);
        assert.strictEqual(getMimeType(''), null);
    });
});

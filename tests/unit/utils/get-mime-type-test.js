import getMimeType from 'dummy/utils/get-mime-type';
import { module, test } from 'qunit';

module('Unit | Utility | get-mime-type', function () {
    test('it returns the mime type for known extensions', function (assert) {
        assert.strictEqual(getMimeType('report.pdf'), 'application/pdf');
        assert.strictEqual(getMimeType('archive.zip'), 'application/zip');
        assert.strictEqual(getMimeType('sheet.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        assert.strictEqual(getMimeType('data.csv'), 'text/csv');
        assert.strictEqual(getMimeType('image.png'), 'image/png');
        assert.strictEqual(getMimeType('photo.jpg'), 'image/jpeg');
        assert.strictEqual(getMimeType('photo.jpeg'), 'image/jpeg');
    });

    test('it matches the whole extension, so .docx is not taken for .doc', function (assert) {
        assert.strictEqual(getMimeType('letter.doc'), 'application/msword');
        assert.strictEqual(getMimeType('letter.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    test('the extension is matched case-insensitively', function (assert) {
        assert.strictEqual(getMimeType('REPORT.PDF'), 'application/pdf');
    });

    test('it returns null for unknown extensions', function (assert) {
        assert.strictEqual(getMimeType('notes.txt'), null);
        assert.strictEqual(getMimeType('no-extension'), null);
        assert.strictEqual(getMimeType(''), null);
        assert.strictEqual(getMimeType('mydoc'), null, 'a name merely ending in an extension is not one');
    });
});

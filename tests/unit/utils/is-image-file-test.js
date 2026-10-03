import isImageFile from 'dummy/utils/is-image-file';
import { module, test } from 'qunit';

module('Unit | Utility | is-image-file', function () {
    test('it detects image mime types and extensions', function (assert) {
        assert.true(isImageFile('image/png'));
        assert.true(isImageFile('jpg'));
        assert.true(isImageFile('photo.JPEG'));
        assert.true(isImageFile('animation.gif'));
        assert.true(isImageFile('modern.webp'));
    });

    test('it rejects non-image types', function (assert) {
        assert.false(isImageFile('application/pdf'));
        assert.false(isImageFile('video/mp4'));
        assert.false(isImageFile('document.docx'));
        assert.false(isImageFile(''));
    });
});

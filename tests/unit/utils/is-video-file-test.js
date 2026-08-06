import isVideoFile from 'dummy/utils/is-video-file';
import { module, test } from 'qunit';

module('Unit | Utility | is-video-file', function () {
    test('it detects video mime types and extensions', function (assert) {
        assert.true(isVideoFile('video/mp4'));
        assert.true(isVideoFile('clip.MOV'));
        assert.true(isVideoFile('legacy.wmv'));
        assert.true(isVideoFile('capture.avi'));
        assert.true(isVideoFile('stream.flv'));
    });

    test('it rejects non-video types', function (assert) {
        assert.false(isVideoFile('image/png'));
        assert.false(isVideoFile('application/pdf'));
        assert.false(isVideoFile(''));
    });
});

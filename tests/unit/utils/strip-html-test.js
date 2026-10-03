import stripHtml from 'dummy/utils/strip-html';
import { module, test } from 'qunit';

module('Unit | Utility | strip-html', function () {
    test('it removes html tags and keeps text content', function (assert) {
        assert.strictEqual(stripHtml('<p>Hello</p>'), 'Hello');
        assert.strictEqual(stripHtml('<div class="x"><strong>Bold</strong> text</div>'), 'Bold text');
        assert.strictEqual(stripHtml('a <br/> b'), 'a  b');
    });

    test('it removes unterminated trailing tags', function (assert) {
        assert.strictEqual(stripHtml('text <unclosed'), 'text ');
    });

    test('it leaves plain strings untouched', function (assert) {
        assert.strictEqual(stripHtml('no tags here'), 'no tags here');
        assert.strictEqual(stripHtml(''), '');
    });
});

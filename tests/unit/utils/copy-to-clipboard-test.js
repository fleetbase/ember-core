import copyToClipboard from 'dummy/utils/copy-to-clipboard';
import { module, test } from 'qunit';

module('Unit | Utility | copy-to-clipboard', function () {
    // TODO: Replace this with your real tests.
    test('it works', function (assert) {
        let result = copyToClipboard();
        assert.ok(result);
    });
});

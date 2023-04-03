import generateUuid from 'dummy/utils/generate-uuid';
import { module, test } from 'qunit';

module('Unit | Utility | generate-uuid', function () {
    // TODO: Replace this with your real tests.
    test('it works', function (assert) {
        let result = generateUuid();
        assert.ok(result);
    });
});

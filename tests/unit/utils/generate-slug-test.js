import generateSlug from 'dummy/utils/generate-slug';
import { module, test } from 'qunit';

module('Unit | Utility | generate-slug', function () {
    // TODO: Replace this with your real tests.
    test('it works', function (assert) {
        let result = generateSlug();
        assert.ok(result);
    });
});

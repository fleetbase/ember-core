import generateSlug from 'dummy/utils/generate-slug';
import { module, test } from 'qunit';

module('Unit | Utility | generate-slug', function () {
    test('it generates a 12 character lowercase alphanumeric slug by default', function (assert) {
        const slug = generateSlug();

        assert.strictEqual(slug.length, 12);
        assert.true(/^[a-z0-9]+$/.test(slug), `slug ${slug} only contains lowercase letters and digits`);
    });

    test('it respects a custom length', function (assert) {
        assert.strictEqual(generateSlug(4).length, 4);
        assert.strictEqual(generateSlug(64).length, 64);
    });

    test('it returns an empty string for zero and negative lengths', function (assert) {
        assert.strictEqual(generateSlug(0), '');
        assert.strictEqual(generateSlug(-3), '');
    });
});

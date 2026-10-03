import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

/**
 * The raw transform is the identity in both directions — it exists so an
 * attribute can opt out of transformation entirely.
 */
module('Unit | Transform | raw', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.transform = this.owner.lookup('transform:raw');
    });

    test('deserialize hands back exactly what it was given', function (assert) {
        const object = { a: 1 };
        const array = [1, 2];

        assert.strictEqual(this.transform.deserialize(object), object);
        assert.strictEqual(this.transform.deserialize(array), array);
        assert.strictEqual(this.transform.deserialize('text'), 'text');
        assert.strictEqual(this.transform.deserialize(0), 0);
        assert.strictEqual(this.transform.deserialize(null), null);
        assert.strictEqual(this.transform.deserialize(undefined), undefined);
    });

    test('serialize hands back exactly what it was given', function (assert) {
        const object = { a: 1 };

        assert.strictEqual(this.transform.serialize(object), object);
        assert.strictEqual(this.transform.serialize(false), false);
        assert.strictEqual(this.transform.serialize(null), null);
    });

    test('a value survives a round trip unchanged', function (assert) {
        const value = { nested: { deep: true } };

        assert.strictEqual(this.transform.deserialize(this.transform.serialize(value)), value);
    });
});

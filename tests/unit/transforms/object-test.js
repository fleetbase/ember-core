import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

/**
 * The object transform copies its input into a fresh plain object, so a record
 * never shares a reference with the payload it came from.
 */
module('Unit | Transform | object', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.transform = this.owner.lookup('transform:object');
    });

    test('deserialize copies rather than passes through', function (assert) {
        const serialized = { a: 1, b: 2 };

        const result = this.transform.deserialize(serialized);

        assert.deepEqual(result, { a: 1, b: 2 });
        assert.notStrictEqual(result, serialized, 'the record does not share the payload object');
    });

    test('serialize copies too', function (assert) {
        const deserialized = { a: 1 };

        const result = this.transform.serialize(deserialized);

        assert.deepEqual(result, { a: 1 });
        assert.notStrictEqual(result, deserialized);
    });

    test('the copy is shallow', function (assert) {
        const nested = { deep: true };

        const result = this.transform.deserialize({ nested });

        assert.strictEqual(result.nested, nested, 'nested values are still shared');
    });

    test('null and undefined become empty objects', function (assert) {
        assert.deepEqual(this.transform.deserialize(null), {});
        assert.deepEqual(this.transform.deserialize(undefined), {});
        assert.deepEqual(this.transform.serialize(null), {});
    });

    test('an array is copied as an index-keyed object', function (assert) {
        assert.deepEqual(this.transform.deserialize(['a', 'b']), { 0: 'a', 1: 'b' }, 'Object.assign spreads indices, so arrays lose their shape');
    });

    test('a primitive yields an empty object', function (assert) {
        assert.deepEqual(this.transform.deserialize(42), {});
        assert.deepEqual(this.transform.deserialize(true), {});
    });

    test('a string is spread into its characters', function (assert) {
        assert.deepEqual(this.transform.deserialize('ab'), { 0: 'a', 1: 'b' });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { A } from '@ember/array';

/**
 * The array transform guarantees an attribute is always an array: iterables are
 * materialized, and anything else becomes empty rather than throwing.
 */
module('Unit | Transform | array', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.transform = this.owner.lookup('transform:array');
    });

    test('an array is passed straight through', function (assert) {
        const serialized = [1, 2, 3];

        assert.strictEqual(this.transform.deserialize(serialized), serialized, 'no copy is made');
        assert.strictEqual(this.transform.serialize(serialized), serialized);
    });

    test('an Ember array is also passed through', function (assert) {
        const serialized = A([1, 2]);

        assert.strictEqual(this.transform.deserialize(serialized), serialized);
    });

    test('a Set is materialized into an array', function (assert) {
        assert.deepEqual(this.transform.deserialize(new Set([1, 2, 2])), [1, 2]);
        assert.deepEqual(this.transform.serialize(new Set(['a'])), ['a']);
    });

    test('a Map is materialized into entry pairs', function (assert) {
        assert.deepEqual(this.transform.deserialize(new Map([['a', 1]])), [['a', 1]]);
    });

    test('a string is iterable, so it becomes its characters', function (assert) {
        assert.deepEqual(this.transform.deserialize('ab'), ['a', 'b']);
    });

    test('null and undefined become empty arrays', function (assert) {
        assert.deepEqual(this.transform.deserialize(null), []);
        assert.deepEqual(this.transform.deserialize(undefined), []);
        assert.deepEqual(this.transform.serialize(null), []);
    });

    test('a non-iterable becomes an empty array rather than throwing', function (assert) {
        assert.deepEqual(this.transform.deserialize(42), []);
        assert.deepEqual(this.transform.deserialize({ a: 1 }), []);
        assert.deepEqual(this.transform.serialize(true), []);
    });

    test('a round trip leaves an array untouched', function (assert) {
        const value = [1, 2];

        assert.strictEqual(this.transform.deserialize(this.transform.serialize(value)), value);
    });
});

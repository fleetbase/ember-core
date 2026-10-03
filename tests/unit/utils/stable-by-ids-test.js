import { stableByIds } from 'dummy/utils/stable-by-ids';
import { module, test } from 'qunit';

module('Unit | Utility | stable-by-ids', function () {
    test('it keeps the previous reference when ids match', function (assert) {
        const prev = [{ id: 1 }, { id: 2 }];
        const next = [{ id: 1 }, { id: 2 }];

        assert.strictEqual(stableByIds(prev, next), prev);
    });

    test('it returns the next array when ids differ', function (assert) {
        const prev = [{ id: 1 }];
        const next = [{ id: 2 }];

        assert.strictEqual(stableByIds(prev, next), next);
    });

    test('it falls back to next when prev is falsy but ids match', function (assert) {
        assert.deepEqual(stableByIds(null, null), null);

        const next = [];
        assert.strictEqual(stableByIds(undefined, next), next, 'a falsy prev yields next');
    });

    test('it honours orderMatters and a custom key', function (assert) {
        const prev = [{ uuid: 'a' }, { uuid: 'b' }];
        const reordered = [{ uuid: 'b' }, { uuid: 'a' }];

        assert.strictEqual(stableByIds(prev, reordered, { key: 'uuid' }), prev, 'order-insensitive by default');
        assert.strictEqual(stableByIds(prev, reordered, { key: 'uuid', orderMatters: true }), reordered, 'order-sensitive returns next');
    });
});

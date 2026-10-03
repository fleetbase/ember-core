import sameIds from 'dummy/utils/same-ids';
import { module, test } from 'qunit';

module('Unit | Utility | same-ids', function () {
    test('it short-circuits on identity', function (assert) {
        const arr = [{ id: 1 }];
        assert.true(sameIds(arr, arr));
        assert.true(sameIds(null, null));
    });

    test('it rejects non-arrays and length mismatches', function (assert) {
        assert.false(sameIds([{ id: 1 }], null));
        assert.false(sameIds(null, [{ id: 1 }]));
        assert.false(sameIds('a', 'b'));
        assert.false(sameIds([{ id: 1 }], [{ id: 1 }, { id: 2 }]));
    });

    test('it compares ids order-insensitively by default', function (assert) {
        assert.true(sameIds([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }]));
        assert.false(sameIds([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 3 }]));
    });

    test('it honours orderMatters', function (assert) {
        assert.false(sameIds([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }], { orderMatters: true }));
        assert.true(sameIds([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }], { orderMatters: true }));
    });

    test('it supports a custom key', function (assert) {
        assert.true(sameIds([{ uuid: 'a' }], [{ uuid: 'a' }], { key: 'uuid' }));
        assert.false(sameIds([{ uuid: 'a' }], [{ uuid: 'b' }], { key: 'uuid' }));
    });

    test('it tolerates nullish members in both comparison modes', function (assert) {
        assert.true(sameIds([null], [null]));
        assert.false(sameIds([null], [{ id: 1 }]));
        assert.true(sameIds([null], [null], { orderMatters: true }));
        assert.false(sameIds([null], [{ id: 1 }], { orderMatters: true }));
    });

    test('empty arrays are equal', function (assert) {
        assert.true(sameIds([], []));
    });
});

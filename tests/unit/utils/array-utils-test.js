import { sameIds, stableByIds, arrayUniqueBy } from 'dummy/utils/array-utils';
import { module, test } from 'qunit';

module('Unit | Utility | array-utils', function () {
    test('it re-exports the array helpers', function (assert) {
        assert.strictEqual(typeof sameIds, 'function');
        assert.strictEqual(typeof stableByIds, 'function');
        assert.strictEqual(typeof arrayUniqueBy, 'function');
    });

    test('the re-exported helpers behave as expected', function (assert) {
        assert.true(sameIds([{ id: 1 }], [{ id: 1 }]));
        assert.deepEqual(arrayUniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], 'id'), [{ id: 1 }, { id: 2 }]);

        const prev = [{ id: 1 }];
        assert.strictEqual(stableByIds(prev, [{ id: 1 }]), prev, 'equal contents keep the previous reference');
    });
});

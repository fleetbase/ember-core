import toModel from 'dummy/utils/to-model';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

/**
 * toModel is meant to push a raw payload into the store as a record. It cannot:
 * the internal CoreObject it builds is created with no owner, so the container
 * lookup inside it has nothing to look up from.
 *
 * Documented here rather than fixed, per the plan to batch defect work. There
 * are no call sites for it in this addon.
 */
module('Unit | Utility | to-model', function (hooks) {
    setupTest(hooks);

    test('it always throws, because the object it builds has no owner', function (assert) {
        // `ToModel.create()` is called with no owner injection, so `getOwner(this)`
        // inside `fn` is undefined and the very next line dereferences it.
        assert.throws(() => toModel({ uuid: '1', name: 'Order A' }, 'order'), /undefined/);
    });

    test('it throws regardless of what it is given', function (assert) {
        assert.throws(() => toModel(null, 'order'), /undefined/);
        assert.throws(() => toModel({}, null), /undefined/);
        assert.throws(() => toModel(), /undefined/);
    });
});

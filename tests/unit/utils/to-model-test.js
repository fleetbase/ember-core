import toModel from 'dummy/utils/to-model';
import { module, test } from 'qunit';

// NOTE: `toModel` builds its helper with `ToModel.create()`, which produces an
// object with no owner, so `getOwner(this)` is undefined and the lookup always
// throws. There are no call sites in this addon. These tests pin the actual
// behaviour; fixing it means giving the helper an owner, which changes the
// public signature and is left for the maintainers to decide.
module('Unit | Utility | to-model', function () {
    test('it throws because the helper is created without an owner', function (assert) {
        assert.throws(() => toModel({ id: '1' }, 'widget'), /lookup/, 'no owner is available to resolve the store');
    });

    test('it throws regardless of the arguments supplied', function (assert) {
        assert.throws(() => toModel(), /lookup/);
        assert.throws(() => toModel(null, null), /lookup/);
    });
});

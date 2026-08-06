import isRelationMissing from 'dummy/utils/is-relation-missing';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';

// NOTE: the non-polymorphic branch computes
//   isset(model, `${relation}_uuid`) && !isset(model, ``)
// The empty-string key looks like an unfinished edit: `isset(model, '')` reads a
// blank path and is always falsy, so `!isset(model, '')` is always true and the
// result reduces to "is the foreign key set". These tests pin actual behaviour.
module('Unit | Utility | is-relation-missing', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class ThingModel extends Model {
            @attr('string') owner_uuid;
            @attr('string') owner_type;
        }

        this.owner.register('model:thing', ThingModel);
        this.store = this.owner.lookup('service:store');
    });

    test('it returns false for anything that is not a model', function (assert) {
        assert.false(isRelationMissing({ owner_uuid: 'abc' }, 'owner'));
        assert.false(isRelationMissing(null, 'owner'));
        assert.false(isRelationMissing(undefined, 'owner'));
    });

    test('it reports true when the foreign key is set', function (assert) {
        const record = this.store.createRecord('thing', { owner_uuid: 'abc-123' });

        assert.true(isRelationMissing(record, 'owner'));
    });

    test('it reports false when the foreign key is absent', function (assert) {
        const record = this.store.createRecord('thing', {});

        assert.false(isRelationMissing(record, 'owner'));
    });

    test('it underscores a camelCase relation name before looking it up', function (assert) {
        const record = this.store.createRecord('thing', { owner_uuid: 'abc-123' });

        assert.true(isRelationMissing(record, 'Owner'), 'the attribute owner_uuid is found from "Owner"');
    });

    test('the polymorphic branch requires both the type and the foreign key', function (assert) {
        const both = this.store.createRecord('thing', { owner_uuid: 'abc', owner_type: 'company' });
        assert.true(isRelationMissing(both, 'owner', { polymorphic: true }));

        const typeOnly = this.store.createRecord('thing', { owner_type: 'company' });
        assert.false(isRelationMissing(typeOnly, 'owner', { polymorphic: true }));

        const keyOnly = this.store.createRecord('thing', { owner_uuid: 'abc' });
        assert.false(isRelationMissing(keyOnly, 'owner', { polymorphic: true }));
    });

    test('polymorphic false falls through to the plain branch', function (assert) {
        const record = this.store.createRecord('thing', { owner_uuid: 'abc' });

        assert.true(isRelationMissing(record, 'owner', { polymorphic: false }));
    });
});

import normalizeRelationsWithinHash from '@fleetbase/ember-core/utils/serialize/normalize-relations-with-hash';
import { module, test } from 'qunit';

module('Unit | Utility | serialize/normalize-relations-with-hash', function () {
    test('it splits an embedded relation into the relation and its id', function (assert) {
        const hash = { owner_uuid: { uuid: 'abc-123', name: 'Acme' } };

        const result = normalizeRelationsWithinHash(hash);

        assert.strictEqual(result.owner_uuid, 'abc-123', 'the foreign key becomes the id');
        assert.deepEqual(result.owner, { uuid: 'abc-123', name: 'Acme' }, 'the payload moves to the relation name');
    });

    test('it honours a custom primary key', function (assert) {
        const hash = { owner_uuid: { id: '7', name: 'Acme' } };

        const result = normalizeRelationsWithinHash(hash, 'id');

        assert.strictEqual(result.owner_uuid, '7');
    });

    test('it leaves an id string alone', function (assert) {
        const hash = { owner_uuid: 'abc-123' };

        const result = normalizeRelationsWithinHash(hash);

        assert.strictEqual(result.owner_uuid, 'abc-123');
        assert.notOk('owner' in result, 'no relation key is invented');
    });

    test('it ignores blank relation payloads', function (assert) {
        const hash = { owner_uuid: null };

        assert.strictEqual(normalizeRelationsWithinHash(hash).owner_uuid, null);
    });

    test('it ignores attributes that are not foreign keys', function (assert) {
        const hash = { owner: { uuid: 'abc' } };

        assert.deepEqual(normalizeRelationsWithinHash(hash).owner, { uuid: 'abc' });
    });

    test('it mutates and returns the same hash', function (assert) {
        const hash = { owner_uuid: { uuid: 'abc' } };

        assert.strictEqual(normalizeRelationsWithinHash(hash), hash);
    });

    test('it passes non-object input straight through', function (assert) {
        assert.strictEqual(normalizeRelationsWithinHash('text'), 'text');
        assert.strictEqual(normalizeRelationsWithinHash(7), 7);
    });
});

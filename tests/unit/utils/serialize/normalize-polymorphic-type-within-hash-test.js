import normalizePolymorphicTypeWithinHash from '@fleetbase/ember-core/utils/serialize/normalize-polymorphic-type-within-hash';
import { module, test } from 'qunit';

module('Unit | Utility | serialize/normalize-polymorphic-type-within-hash', function () {
    test('it rewrites backslashed class names on _type attributes', function (assert) {
        const hash = { owner_type: 'Fleetbase\\Models\\Company', name: 'Acme' };

        const result = normalizePolymorphicTypeWithinHash(hash);

        assert.strictEqual(result.owner_type, 'company');
        assert.strictEqual(result.name, 'Acme', 'other attributes are untouched');
    });

    test('it mutates and returns the same hash', function (assert) {
        const hash = { owner_type: 'Fleetbase\\Models\\Company' };

        assert.strictEqual(normalizePolymorphicTypeWithinHash(hash), hash);
    });

    test('it leaves _type values without a backslash alone', function (assert) {
        const hash = { owner_type: 'company' };

        assert.strictEqual(normalizePolymorphicTypeWithinHash(hash).owner_type, 'company');
    });

    test('it ignores attributes that are not _type', function (assert) {
        const hash = { owner: 'Fleetbase\\Models\\Company' };

        assert.strictEqual(normalizePolymorphicTypeWithinHash(hash).owner, 'Fleetbase\\Models\\Company');
    });

    test('it copies a nested relation type onto _type', function (assert) {
        const hash = {
            owner_type: 'Fleetbase\\Models\\Company',
            owner: { id: '1', type: 'company' },
        };

        const result = normalizePolymorphicTypeWithinHash(hash);

        assert.strictEqual(result.owner._type, 'company');
    });

    test('it tolerates a missing or blank relation payload', function (assert) {
        assert.strictEqual(normalizePolymorphicTypeWithinHash({ owner_type: 'Fleetbase\\Models\\Company', owner: null }).owner_type, 'company');
        assert.strictEqual(normalizePolymorphicTypeWithinHash({ owner_type: 'Fleetbase\\Models\\Company', owner: {} }).owner_type, 'company');
    });

    test('it passes non-object input straight through', function (assert) {
        assert.strictEqual(normalizePolymorphicTypeWithinHash('text'), 'text');
        assert.strictEqual(normalizePolymorphicTypeWithinHash(42), 42);
        assert.strictEqual(normalizePolymorphicTypeWithinHash(undefined), undefined);
    });
});

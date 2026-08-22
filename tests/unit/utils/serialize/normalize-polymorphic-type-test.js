import normalizePolymorphicType from '@fleetbase/ember-core/utils/serialize/normalize-polymorphic-type';
import { module, test } from 'qunit';

module('Unit | Utility | serialize/normalize-polymorphic-type', function () {
    test('it reduces a backslashed api class name to a lowercase model name', function (assert) {
        assert.strictEqual(normalizePolymorphicType('Fleetbase\\Models\\Order'), 'order');
        assert.strictEqual(normalizePolymorphicType('Fleetbase\\FleetOps\\Models\\Vehicle'), 'vehicle');
    });

    test('it returns the original value when there is no backslash to split on', function (assert) {
        assert.strictEqual(normalizePolymorphicType('order'), 'order');
    });

    test('it prefers the supplied default for values without a backslash', function (assert) {
        assert.strictEqual(normalizePolymorphicType('order', 'fallback'), 'fallback');
    });

    test('it lowercases only the final segment', function (assert) {
        assert.strictEqual(normalizePolymorphicType('App\\Models\\DeliveryTarget'), 'deliverytarget');
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr, belongsTo } from '@ember-data/model';

module('Unit | Serializer | application', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class CompanyModel extends Model {
            @attr('string') name;
        }

        class WidgetModel extends Model {
            @attr('string') name;
            @attr('string') slug;
            @belongsTo('company', { async: false, inverse: null }) company;
        }

        this.owner.register('model:company', CompanyModel);
        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
        this.serializer = this.store.serializerFor('application');
    });

    test('it is registered as the fallback serializer', function (assert) {
        assert.ok(this.serializer, 'a serializer is resolved');
        assert.strictEqual(this.serializer.primaryKey, 'uuid', 'records are keyed by uuid rather than id');
        assert.deepEqual(this.serializer.readOnlyAttributes, ['slug']);
    });

    test('it derives an underscored key for polymorphic types', function (assert) {
        assert.strictEqual(this.serializer.keyForPolymorphicType('deliveryTarget'), 'delivery_target_type');
        assert.strictEqual(this.serializer.keyForPolymorphicType('owner'), 'owner_type');
    });

    test('it strips read-only attributes when serializing a record', function (assert) {
        const record = this.store.createRecord('widget', { name: 'Gadget', slug: 'gadget' });

        const json = record.serialize();

        assert.strictEqual(json.name, 'Gadget');
        assert.notOk('slug' in json, 'the read-only slug is removed from the payload');
    });

    test('it removes read-only attributes from an arbitrary payload', function (assert) {
        const payload = { name: 'Ron', slug: '-1' };

        this.serializer.removeReadOnlyAttributes(payload);

        assert.deepEqual(payload, { name: 'Ron' });
    });

    test('it leaves payloads without read-only attributes untouched', function (assert) {
        const payload = { name: 'Ron' };

        this.serializer.removeReadOnlyAttributes(payload);

        assert.deepEqual(payload, { name: 'Ron' });
    });
});

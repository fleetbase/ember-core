import getModelSavePermission from 'dummy/utils/get-model-save-permission';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';

module('Unit | Utility | get-model-save-permission', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class OrderModel extends Model {
            @attr('string') name;
        }

        this.owner.register('model:order', OrderModel);
        this.store = this.owner.lookup('service:store');
    });

    test('it asks for create permission on a new record', function (assert) {
        const record = this.store.createRecord('order', { name: 'New' });

        assert.strictEqual(getModelSavePermission('fleet-ops', record), 'fleet-ops create order');
    });

    test('it asks for update permission on a persisted record', function (assert) {
        this.store.push({ data: { id: '1', type: 'order', attributes: { name: 'Saved' } } });
        const record = this.store.peekRecord('order', '1');

        assert.strictEqual(getModelSavePermission('fleet-ops', record), 'fleet-ops update order');
    });

    test('it falls back to update for values that are not records', function (assert) {
        assert.strictEqual(getModelSavePermission('fleet-ops', null), 'fleet-ops update null');
        assert.strictEqual(getModelSavePermission('fleet-ops', undefined), 'fleet-ops update null');
    });
});

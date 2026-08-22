import serializeModelArray from 'dummy/utils/serialize-model-array';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';

module('Unit | Utility | serialize-model-array', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class WidgetModel extends Model {
            @attr('string') name;
        }

        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
    });

    test('it serializes each model in an array', function (assert) {
        const records = [this.store.createRecord('widget', { name: 'a' }), this.store.createRecord('widget', { name: 'b' })];

        assert.deepEqual(serializeModelArray(records), [{ name: 'a' }, { name: 'b' }]);
    });

    test('it leaves plain array members untouched', function (assert) {
        assert.deepEqual(serializeModelArray([1, 'two', null]), [1, 'two', null]);
        assert.deepEqual(serializeModelArray([]), []);
    });

    test('it passes non-arrays through unchanged', function (assert) {
        const obj = { not: 'an array' };

        assert.strictEqual(serializeModelArray(obj), obj);
        assert.strictEqual(serializeModelArray(null), null);
        assert.strictEqual(serializeModelArray(undefined), undefined);
    });
});

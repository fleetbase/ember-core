import isModel from 'dummy/utils/is-model';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';
import ObjectProxy from '@ember/object/proxy';

module('Unit | Utility | is-model', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class WidgetModel extends Model {
            @attr('string') name;
        }

        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
    });

    test('it returns true for ember-data records', function (assert) {
        const record = this.store.createRecord('widget', { name: 'gadget' });

        assert.true(isModel(record));
    });

    test('it returns true for object proxies', function (assert) {
        assert.true(isModel(ObjectProxy.create({ content: {} })));
    });

    test('it returns false for plain values', function (assert) {
        assert.false(isModel({}));
        assert.false(isModel(null));
        assert.false(isModel(undefined));
        assert.false(isModel('widget'));
        assert.false(isModel([]));
    });
});

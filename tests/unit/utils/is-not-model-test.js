import isNotModel from 'dummy/utils/is-not-model';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';
import ObjectProxy from '@ember/object/proxy';

module('Unit | Utility | is-not-model', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class WidgetModel extends Model {
            @attr('string') name;
        }

        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
    });

    test('it returns false for records and proxies', function (assert) {
        assert.false(isNotModel(this.store.createRecord('widget', { name: 'gadget' })));
        assert.false(isNotModel(ObjectProxy.create({ content: {} })));
    });

    test('it returns true for anything else', function (assert) {
        assert.true(isNotModel({}));
        assert.true(isNotModel(null));
        assert.true(isNotModel('widget'));
    });
});

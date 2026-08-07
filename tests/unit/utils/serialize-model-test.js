import serializeModel from 'dummy/utils/serialize-model';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';
import ObjectProxy from '@ember/object/proxy';

module('Unit | Utility | serialize-model', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class WidgetModel extends Model {
            @attr('string') name;
        }

        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
    });

    test('it serializes an ember-data model via toJSON', function (assert) {
        const record = this.store.createRecord('widget', { name: 'gadget' });

        assert.deepEqual(serializeModel(record), { name: 'gadget' });
    });

    test('it passes non-model values through untouched', function (assert) {
        const plain = { name: 'plain' };

        assert.strictEqual(serializeModel(plain), plain);
        assert.strictEqual(serializeModel(null), null);
        assert.strictEqual(serializeModel(undefined), undefined);
        assert.strictEqual(serializeModel('text'), 'text');
        assert.strictEqual(serializeModel(7), 7);
    });

    test('it falls back to serialize when there is no toJSON', function (assert) {
        // isModel accepts an ObjectProxy as well as a Model, and a proxy has no
        // toJSON — so this is the branch that reaches `serialize()`.
        const proxied = ObjectProxy.extend({
            serialize() {
                return { via: 'serialize' };
            },
        }).create();

        assert.deepEqual(serializeModel(proxied), { via: 'serialize' });
    });

    test('a proxy with neither method is passed through', function (assert) {
        const proxied = ObjectProxy.create({ content: { name: 'plain' } });

        assert.strictEqual(serializeModel(proxied), proxied);
    });
});

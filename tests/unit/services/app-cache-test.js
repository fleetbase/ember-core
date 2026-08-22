import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

module('Unit | Service | app-cache', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class WidgetModel extends Model {
            @attr('string') name;
        }

        this.owner.register('model:widget', WidgetModel);
        this.owner.register(
            'service:current-user',
            class extends Service {
                id = 'user-1';
                companyId = 'company-1';
            }
        );

        this.cache = this.owner.lookup('service:app-cache');
        this.store = this.owner.lookup('service:store');
    });

    test('it namespaces keys by user and company', function (assert) {
        assert.strictEqual(this.cache.cachePrefix, 'user-1:company-1:');
    });

    test('it falls back to anonymous identifiers', function (assert) {
        // The service reads through injections, so blanking the current user in
        // place is enough and avoids re-registering an already-resolved service.
        this.cache.currentUser.id = undefined;
        this.cache.currentUser.companyId = undefined;

        assert.strictEqual(this.cache.cachePrefix, 'anon:no-org:');
    });

    test('it stores and reads values, dasherizing the key', function (assert) {
        this.cache.set('someKey', 'value');

        assert.strictEqual(this.cache.get('someKey'), 'value');
        assert.strictEqual(this.cache.get('some-key'), 'value', 'the key is dasherized on both paths');
    });

    test('set returns the service so calls can be chained', function (assert) {
        assert.strictEqual(this.cache.set('a', 1), this.cache);
    });

    test('it returns the supplied default for a missing key', function (assert) {
        assert.strictEqual(this.cache.get('missing'), null, 'null is the default default');
        assert.strictEqual(this.cache.get('missing', 'fallback'), 'fallback');
    });

    test('has reports presence accurately', function (assert) {
        this.cache.set('present', 'yes');

        assert.true(this.cache.has('present'));
        assert.false(this.cache.has('absent'), 'a missing key is not reported as present');
    });

    test('doesntHave is the inverse of has', function (assert) {
        this.cache.set('present', 'yes');

        assert.false(this.cache.doesntHave('present'));
        assert.true(this.cache.doesntHave('absent'));
    });

    test('has and doesntHave accept a list of keys', function (assert) {
        this.cache.set('a', 1);
        this.cache.set('b', 2);

        assert.true(this.cache.has(['a', 'b']));
        assert.false(this.cache.has(['a', 'missing']), 'every key must be present');
        assert.true(this.cache.doesntHave(['x', 'y']));
        assert.false(this.cache.doesntHave(['a', 'x']));
    });

    test('it round-trips a single ember-data record', function (assert) {
        const record = this.store.createRecord('widget', { name: 'Gadget' });
        this.store.push({ data: { id: 'w-1', type: 'widget', attributes: { name: 'Gadget' } } });

        this.cache.setEmberData('widget', this.store.peekRecord('widget', 'w-1'));
        const restored = this.cache.getEmberData('widget', 'widget');

        assert.strictEqual(restored.name, 'Gadget');
        assert.strictEqual(record.name, 'Gadget', 'the original record is untouched');
    });

    test('it round-trips a collection of ember-data records', function (assert) {
        this.store.push({
            data: [
                { id: 'w-1', type: 'widget', attributes: { name: 'One' } },
                { id: 'w-2', type: 'widget', attributes: { name: 'Two' } },
            ],
        });

        this.cache.setEmberData('widgets', this.store.peekAll('widget').slice());
        const restored = this.cache.getEmberData('widgets', 'widget');

        assert.deepEqual(
            restored.map((widget) => widget.name),
            ['One', 'Two']
        );
    });
});

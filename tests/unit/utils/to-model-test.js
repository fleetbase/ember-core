import toModel from 'dummy/utils/to-model';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * toModel pushes a raw payload into the store as a record.
 *
 * It used to build a bare CoreObject and call `getOwner(this)` on it, which is
 * always undefined, so every call threw on the next line. It now takes the
 * owner from the caller — `this` from a service, component or route, or an
 * owner directly.
 */
class OrderModel extends Model {
    @attr('string') name;
}

module('Unit | Utility | to-model', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('model:order', OrderModel);
        this.store = this.owner.lookup('service:store');
    });

    test('a payload is normalized and pushed', function (assert) {
        // ApplicationSerializer sets primaryKey = 'uuid'.
        const record = toModel({ uuid: 'order-1', name: 'Order A' }, 'order', this.owner);

        assert.strictEqual(record.id, 'order-1');
        assert.strictEqual(record.name, 'Order A');
        assert.strictEqual(this.store.peekRecord('order', 'order-1'), record, 'and it is in the store');
    });

    test('anything with an owner can be passed instead of the owner', function (assert) {
        this.owner.register('service:thing', class extends Service {});
        const service = this.owner.lookup('service:thing');

        const record = toModel({ uuid: 'order-2', name: 'Order B' }, 'order', service);

        assert.strictEqual(record.id, 'order-2', 'getOwner resolves the container from the service');
    });

    test('an existing record is updated rather than duplicated', function (assert) {
        toModel({ uuid: 'order-1', name: 'Order A' }, 'order', this.owner);

        const updated = toModel({ uuid: 'order-1', name: 'Order A renamed' }, 'order', this.owner);

        assert.strictEqual(updated.name, 'Order A renamed');
        assert.strictEqual(this.store.peekAll('order').length, 1);
    });

    test('it says so when no owner is supplied', function (assert) {
        assert.throws(() => toModel({ uuid: 'order-1' }, 'order'), /needs an owner/);
        assert.throws(() => toModel({ uuid: 'order-1' }, 'order', {}), /needs an owner/);
    });
});

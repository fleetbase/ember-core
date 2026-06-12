import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

module('Unit | Serializer | application', function (hooks) {
    setupTest(hooks);

    // Replace this with your real tests.
    test('it exists', function (assert) {
        let store = this.owner.lookup('service:store');
        let serializer = store.serializerFor('application');

        assert.ok(serializer);
    });

    test('it serializes records', function (assert) {
        let store = this.owner.lookup('service:store');
        let record = store.createRecord('application', {});

        let serializedRecord = record.serialize();

        assert.ok(serializedRecord);
    });

    test('it removes read-only attributes from serialized payloads', function (assert) {
        let store = this.owner.lookup('service:store');
        let serializer = store.serializerFor('application');
        let payload = {
            name: 'Ron',
            slug: '-1',
        };

        serializer.removeReadOnlyAttributes(payload);

        assert.deepEqual(payload, { name: 'Ron' });
    });
});

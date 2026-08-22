import createNotificationKey from 'dummy/utils/create-notification-key';
import { module, test } from 'qunit';

module('Unit | Utility | create-notification-key', function () {
    test('it strips non-word characters from the definition and camelizes both parts', function (assert) {
        assert.strictEqual(createNotificationKey('fleet-ops:order', 'order-created'), 'fleetopsorder__orderCreated');
    });

    test('it camelizes multi-word names', function (assert) {
        assert.strictEqual(createNotificationKey('billing', 'invoice_paid'), 'billing__invoicePaid');
    });

    test('it handles empty inputs', function (assert) {
        assert.strictEqual(createNotificationKey('', ''), '__');
    });
});

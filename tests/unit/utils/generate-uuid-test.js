import generateUuid from 'dummy/utils/generate-uuid';
import { module, test } from 'qunit';

module('Unit | Utility | generate-uuid', function () {
    test('it produces rfc4122 version 4 formatted uuids', function (assert) {
        const uuid = generateUuid();

        assert.strictEqual(typeof uuid, 'string');
        assert.true(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid), `uuid ${uuid} matches the v4 format`);
    });

    test('it produces unique values across invocations', function (assert) {
        const seen = new Set(Array.from({ length: 32 }, () => generateUuid()));
        assert.strictEqual(seen.size, 32);
    });
});

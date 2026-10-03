import mockResponse from 'dummy/utils/mock-response';
import { module, test } from 'qunit';

module('Unit | Utility | mock-response', function () {
    test('it resolves an empty collection carrying pagination meta', async function (assert) {
        const response = await mockResponse();

        assert.true(Array.isArray(response));
        assert.strictEqual(response.length, 0);
        assert.deepEqual(response.meta, {
            current_page: 1,
            from: 1,
            last_page: 1,
            per_page: 25,
            to: 1,
            total: 1,
        });
    });

    test('it returns a distinct response each call', async function (assert) {
        const [first, second] = await Promise.all([mockResponse(), mockResponse()]);

        assert.notStrictEqual(first, second);
    });
});

import isUuid from 'dummy/utils/is-uuid';
import { module, test } from 'qunit';

module('Unit | Utility | is-uuid', function () {
    test('it accepts valid uuids of versions 1-5', function (assert) {
        assert.true(isUuid('123e4567-e89b-12d3-a456-426614174000'));
        assert.true(isUuid('c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd'));
        assert.true(isUuid('C73BCDCC-2669-4Bf6-81D3-E4AE73FB11FD'));
    });

    test('it rejects invalid uuid strings', function (assert) {
        assert.false(isUuid('c73bcdcc-2669-7bf6-81d3-e4ae73fb11fd'), 'version nibble above 5 is rejected');
        assert.false(isUuid('c73bcdcc-2669-4bf6-c1d3-e4ae73fb11fd'), 'invalid variant nibble is rejected');
        assert.false(isUuid('c73bcdcc26694bf681d3e4ae73fb11fd'), 'missing dashes are rejected');
        assert.false(isUuid('not-a-uuid'));
        assert.false(isUuid(''));
    });

    test('it rejects non-string values', function (assert) {
        assert.false(isUuid(null));
        assert.false(isUuid(undefined));
        assert.false(isUuid(12345));
        assert.false(isUuid({}));
    });
});

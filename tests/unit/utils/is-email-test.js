import isEmail from 'dummy/utils/is-email';
import { module, test } from 'qunit';

module('Unit | Utility | is-email', function () {
    test('it accepts valid email addresses', function (assert) {
        assert.true(isEmail('user@example.com'));
        assert.true(isEmail('first.last@sub.domain.co'));
        assert.true(isEmail('user+tag@example.io'));
        assert.true(isEmail('"quoted user"@example.com'));
        assert.true(isEmail('user@[127.0.0.1]'));
    });

    test('it rejects invalid email addresses', function (assert) {
        assert.false(isEmail('not-an-email'));
        assert.false(isEmail('missing-domain@'));
        assert.false(isEmail('@missing-local.com'));
        assert.false(isEmail('user@no-tld'));
        assert.false(isEmail('user with spaces@example.com'));
        assert.false(isEmail('user@@example.com'));
    });

    test('it rejects nullish and non-string values', function (assert) {
        assert.false(isEmail());
        assert.false(isEmail(null));
        assert.false(isEmail(''));
        assert.false(isEmail(42));
        assert.false(isEmail(true));
        assert.false(isEmail({}));
    });
});

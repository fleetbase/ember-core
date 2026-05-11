import { module, test } from 'qunit';
import { ensureWhoisTimezone, getBrowserTimezone } from 'dummy/utils/lookup-user-ip';

module('Unit | Utility | lookup-user-ip', function () {
    test('it preserves provider timezone', function (assert) {
        const whois = ensureWhoisTimezone({ timezone: 'Europe/Berlin' });

        assert.strictEqual(whois.timezone, 'Europe/Berlin');
    });

    test('it falls back to browser timezone when provider timezone is missing', function (assert) {
        const whois = ensureWhoisTimezone({ city: 'New York' });

        assert.strictEqual(whois.timezone, getBrowserTimezone());
    });
});

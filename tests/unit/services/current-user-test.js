import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

module('Unit | Service | current-user', function (hooks) {
    setupTest(hooks);

    // TODO: Replace this with your real tests.
    test('it exists', function (assert) {
        let service = this.owner.lookup('service:current-user');
        assert.ok(service);
    });

    test('it resolves timezone from whois data', function (assert) {
        let service = this.owner.lookup('service:current-user');

        service.setOption('whois', { timezone: 'America/New_York' });

        assert.strictEqual(service.timezone, 'America/New_York');
    });

    test('it falls back to browser timezone when whois timezone is missing', function (assert) {
        let service = this.owner.lookup('service:current-user');

        service.setOption('whois', {});

        assert.strictEqual(service.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
});

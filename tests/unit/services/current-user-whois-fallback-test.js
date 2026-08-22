import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';
import { set } from '@ember/object';

/**
 * What loadWhois does when the lookup fails, and the company-option default.
 *
 * lookupUserIp reaches the network through the GLOBAL fetch, which is
 * stubbable — the sibling loading test uses the same swap for the success path.
 */
class CompanyModel extends Model {
    @attr() options;
}

module('Unit | Service | current-user (whois fallback)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.originalConsoleError = console.error;
        console.error = () => {};
        this.originalFetch = window.fetch;
        window.fetch = () => Promise.reject(new Error('offline'));

        this.warnings = [];
        // lookupUserIp caches a successful lookup in localStorage, so a
        // neighbouring test's success would be returned here instead of the
        // failure this module is about.
        localStorage.removeItem('fleetbase:whois');

        for (const name of ['fetch', 'session', 'theme', 'universe', 'socket', 'intl']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('model:company', CompanyModel);
        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:current-user');

        // CurrentUserService is `Service.extend(Evented)` — a CLASSIC class, so
        // its injections are Ember descriptors. Neither a plain assignment nor
        // Object.defineProperty shadows those; `set` is what reaches them.
        // (Registering a stub over `service:notifications` is separately
        // unreliable — ember-cli-notifications ships the same app-tree path.)
        set(this.service, 'notifications', {
            warning: (message) => this.warnings.push(message),
            serverError: () => {},
        });
    });

    hooks.afterEach(function () {
        if (typeof this.originalConsoleError === 'function') {
            console.error = this.originalConsoleError;
        }
        if (typeof this.originalFetch === 'function') {
            window.fetch = this.originalFetch;
        }
    });

    module('loadWhois when the network is down', function () {
        test('it resolves with a fallback rather than rejecting', async function (assert) {
            const whois = await this.service.loadWhois();

            assert.strictEqual(whois._source, 'fallback');
            assert.strictEqual(whois.city, null);
            assert.strictEqual(whois.country_code, null);
            assert.strictEqual(typeof whois.timezone, 'string', 'carrying the browser timezone');
        });

        test('the user is NOT warned, because the failure never reaches this service', async function (assert) {
            // Pinned, not fixed. loadWhois wraps lookupUserIp in a try/catch
            // whose catch warns the user and builds a fallback — but
            // lookupUserIp already absorbs every failure itself and RETURNS
            // getFallbackWhois() instead of rejecting. So the catch is
            // unreachable by a failing lookup, the duplicate fallback below it
            // is dead, and the user is never told their location is unknown.
            await this.service.loadWhois();

            assert.deepEqual(this.warnings, [], 'the warning the code intends to show never fires');
        });

        test('the fallback is stored so it is not looked up again', async function (assert) {
            const whois = await this.service.loadWhois();

            assert.deepEqual(this.service.whoisData, whois);
        });
    });

    module('loadWhois when storing the result fails', function () {
        test('that failure DOES reach the catch, and warns', async function (assert) {
            // The only way into the catch: something after lookupUserIp throws.
            // A storage write is the realistic candidate.
            let calls = 0;
            this.service.setOption = () => {
                calls += 1;
                if (calls === 1) {
                    throw new Error('storage full');
                }
            };

            const whois = await this.service.loadWhois();

            assert.strictEqual(this.warnings.length, 1);
            assert.true(this.warnings[0].includes('Unable to detect your location'));
            assert.strictEqual(whois._source, 'fallback');
            assert.strictEqual(calls, 2, 'the catch retries the write with its own fallback');
        });

        test('the service fallback is kept as the whois data', async function (assert) {
            let calls = 0;
            this.service.setOption = () => {
                calls += 1;
                if (calls === 1) {
                    throw new Error('storage full');
                }
            };

            const whois = await this.service.loadWhois();

            assert.deepEqual(this.service.whoisData, whois);
            assert.strictEqual(whois.city, null);
        });
    });

    module('getCompanyOption', function () {
        test('it reads an option off the company record', function (assert) {
            this.store.push({ data: { id: 'company-1', type: 'company', attributes: { options: { branding: 'dark' } } } });
            this.service.companyId = 'company-1';

            assert.strictEqual(this.service.getCompanyOption('branding'), 'dark');
        });

        test('an option the company does not have falls back', function (assert) {
            this.store.push({ data: { id: 'company-1', type: 'company', attributes: { options: {} } } });
            this.service.companyId = 'company-1';

            assert.strictEqual(this.service.getCompanyOption('branding'), null, 'null by default');
            assert.strictEqual(this.service.getCompanyOption('branding', 'light'), 'light');
        });

        test('no company at all falls back too', function (assert) {
            this.service.companyId = 'missing-company';

            assert.strictEqual(this.service.getCompanyOption('branding', 'light'), 'light');
        });

        test('a stored falsy option is returned rather than replaced by the default', function (assert) {
            this.store.push({ data: { id: 'company-1', type: 'company', attributes: { options: { sandbox: false } } } });
            this.service.companyId = 'company-1';

            assert.false(this.service.getCompanyOption('sandbox', true), 'only undefined triggers the default');
        });
    });
});

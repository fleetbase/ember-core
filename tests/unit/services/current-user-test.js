import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

const SESSION_KEY = 'ember_simple_auth-session';

/**
 * Options are stored per user in one flat local-storage bag, keyed
 * `<owner>:<dasherized-key>`. Which owner that is depends on the session, with
 * a local-storage fallback so a page reload before the session restores still
 * reads the right user's settings.
 *
 * The whois accessors read those options, falling back to a separate cache.
 */
class CompanyModel extends Model {
    @attr() options;
    @attr('string') name;
}

module('Unit | Service | current-user', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.sessionData = { authenticated: {} };
        this.isAuthenticated = false;
        this.locales = [];
        const testContext = this;

        this.owner.register(
            'service:session',
            class extends Service {
                get data() {
                    return testContext.sessionData;
                }
                get isAuthenticated() {
                    return testContext.isAuthenticated;
                }
            }
        );

        this.owner.register(
            'service:intl',
            class extends Service {
                setLocale(locale) {
                    testContext.locales.push(locale);
                }
            }
        );

        for (const name of ['fetch', 'theme', 'notifications', 'events', 'universe']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('model:company', CompanyModel);

        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:current-user');

        this.authenticate = (user = 'user-1') => {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user, token: 'abc' } };
        };
    });

    hooks.afterEach(function () {
        window.localStorage.removeItem(SESSION_KEY);
    });

    module('the option owner', function () {
        test('an authenticated session names the owner', function (assert) {
            this.authenticate('user-1');

            assert.strictEqual(this.service.authenticatedOptionOwnerId, 'user-1');
            assert.strictEqual(this.service.optionsPrefix, 'user-1:');
        });

        test('a stored session is used before the session service restores', function (assert) {
            window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: 'abc', user: 'user-2' } }));

            assert.strictEqual(this.service.authenticatedOptionOwnerId, 'user-2', 'a reload still reads the right user');
        });

        test('a stored session without both a token and a user is ignored', function (assert) {
            window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: 'abc' } }));
            assert.strictEqual(this.service.authenticatedOptionOwnerId, null);

            window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { user: 'user-2' } }));
            assert.strictEqual(this.service.authenticatedOptionOwnerId, null);
        });

        test('malformed session storage is survivable', function (assert) {
            window.localStorage.setItem(SESSION_KEY, 'not json');

            assert.strictEqual(this.service.authenticatedOptionOwnerId, null, 'the parse error is swallowed');
        });

        test('with nothing to go on the prefix falls back to anon', function (assert) {
            assert.strictEqual(this.service.optionsPrefix, 'anon:');
        });

        test('an authenticated session with no user id falls through', function (assert) {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: {} };

            assert.strictEqual(this.service.authenticatedOptionOwnerId, null);
        });
    });

    module('options', function () {
        test('a value round-trips', function (assert) {
            this.service.setOption('colour', 'blue');

            assert.strictEqual(this.service.getOption('colour'), 'blue');
        });

        test('setOption chains', function (assert) {
            assert.strictEqual(this.service.setOption('colour', 'blue'), this.service);
        });

        test('keys are dasherized before storage', function (assert) {
            this.service.setOption('testKey', 'value');

            assert.strictEqual(this.service.options.get('anon:test-key'), 'value', 'camelCase is stored dasherized');
            assert.strictEqual(this.service.getOption('testKey'), 'value', 'and reads back under the same spelling');
        });

        test('an absent option yields the supplied default', function (assert) {
            assert.strictEqual(this.service.getOption('nothing'), null, 'null by default');
            assert.strictEqual(this.service.getOption('nothing', 'fallback'), 'fallback');
        });

        test('options are scoped to the owner', function (assert) {
            this.authenticate('user-1');
            this.service.setOption('colour', 'blue');

            this.authenticate('user-2');

            assert.strictEqual(this.service.getOption('colour'), null, "another user's options are not visible");
        });

        test('hasOption reports whether the key is actually stored', function (assert) {
            // Regression: this asked getOption, whose `defaultValue = null`
            // parameter applies whenever the stored value is undefined — so it
            // could never return undefined and hasOption was always true.
            assert.false(this.service.hasOption('colour'));

            this.service.setOption('colour', 'blue');
            assert.true(this.service.hasOption('colour'));
        });

        test('hasOption is true for a stored falsy value', function (assert) {
            this.service.setOption('colour', '');

            assert.true(this.service.hasOption('colour'), 'stored-but-empty is still stored');
        });

        test('filledOption is about emptiness, not presence', function (assert) {
            this.service.setOption('colour', '');
            assert.false(this.service.filledOption('colour'));

            this.service.setOption('colour', 'blue');
            assert.true(this.service.filledOption('colour'));
        });

        test('filledOption is false for an absent key', function (assert) {
            assert.false(this.service.filledOption('nothing'));
        });
    });

    module('locale', function () {
        test('setting it stores the option, tells intl, and chains', function (assert) {
            assert.strictEqual(this.service.setLocale('fr-fr'), this.service);

            assert.strictEqual(this.service.getOption('locale'), 'fr-fr');
            assert.deepEqual(this.locales, ['fr-fr']);
            assert.strictEqual(this.service.locale, 'fr-fr');
        });

        test('it defaults to en-us', function (assert) {
            assert.strictEqual(this.service.locale, 'en-us');
        });
    });

    module('whois', function () {
        test('properties are read from the stored whois option', function (assert) {
            this.service.setOption('whois', {
                latitude: 1.5,
                longitude: 2.5,
                city: 'Kuala Lumpur',
                country_code: 'MY',
                currency: { code: 'MYR' },
                timezone: 'Asia/Kuala_Lumpur',
            });

            assert.strictEqual(this.service.latitude, 1.5);
            assert.strictEqual(this.service.longitude, 2.5);
            assert.strictEqual(this.service.city, 'Kuala Lumpur');
            assert.strictEqual(this.service.country, 'MY');
            assert.strictEqual(this.service.currency, 'MYR', 'nested paths are supported');
            assert.strictEqual(this.service.timezone, 'Asia/Kuala_Lumpur');
        });

        test('the timezone falls back to the browser', function (assert) {
            this.service.setOption('whois', {});

            assert.strictEqual(this.service.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
        });

        test('with no whois option it falls back to the cache', function (assert) {
            this.service.cache.set('lookup/whois', { city: 'Cached City' });

            assert.strictEqual(this.service.city, 'Cached City');
        });

        test('a non-object whois option also falls through to the cache', function (assert) {
            this.service.setOption('whois', 'not an object');
            this.service.cache.set('lookup/whois', { city: 'Cached City' });

            assert.strictEqual(this.service.city, 'Cached City');
        });

        test('with neither source a property is null', function (assert) {
            assert.strictEqual(this.service.city, null);
        });

        test('whois is an alias for getWhoisProperty', function (assert) {
            this.service.setOption('whois', { city: 'Kuala Lumpur' });

            assert.strictEqual(this.service.whois('city'), this.service.getWhoisProperty('city'));
        });
    });

    module('company options', function () {
        test('a value is read off the company record', function (assert) {
            this.store.push({ data: { id: 'company-1', type: 'company', attributes: { options: { branding: 'dark' } } } });
            this.service.userSnapshot = { id: 'user-1', company_uuid: 'company-1' };

            assert.strictEqual(this.service.getCompanyOption('branding'), 'dark');
        });

        test('an absent key yields the default', function (assert) {
            this.store.push({ data: { id: 'company-1', type: 'company', attributes: { options: {} } } });
            this.service.userSnapshot = { id: 'user-1', company_uuid: 'company-1' };

            assert.strictEqual(this.service.getCompanyOption('branding'), null);
            assert.strictEqual(this.service.getCompanyOption('branding', 'light'), 'light');
        });

        test('getCompany reads the company for the current user', function (assert) {
            this.store.push({ data: { id: 'company-1', type: 'company', attributes: { name: 'Acme' } } });
            this.service.user = { company_uuid: 'company-1' };

            assert.strictEqual(this.service.getCompany().name, 'Acme');
            assert.strictEqual(this.service.company.name, 'Acme', 'and caches it on the service');
        });

        test('an unknown company is null', function (assert) {
            this.service.user = { company_uuid: 'nope' };

            assert.strictEqual(this.service.getCompany(), null);
        });
    });

    module('defaults', function () {
        test('the service starts anonymous', function (assert) {
            assert.deepEqual(this.service.user, { id: 'anon' });
            assert.deepEqual(this.service.userSnapshot, { id: 'anon' });
            assert.deepEqual(this.service.permissions, []);
            assert.deepEqual(this.service.organizations, []);
        });

        test('the identity aliases read through to the snapshot', function (assert) {
            this.service.userSnapshot = {
                id: 'user-1',
                name: 'Ron',
                email: 'ron@example.com',
                phone: '+60123',
                avatar_url: '/avatar.png',
                is_admin: true,
                company_uuid: 'company-1',
                company_name: 'Acme',
                role_name: 'Admin',
            };

            assert.strictEqual(this.service.id, 'user-1');
            assert.strictEqual(this.service.name, 'Ron');
            assert.strictEqual(this.service.email, 'ron@example.com');
            assert.strictEqual(this.service.phone, '+60123');
            assert.strictEqual(this.service.avatarUrl, '/avatar.png');
            assert.true(this.service.isAdmin);
            assert.strictEqual(this.service.companyId, 'company-1');
            assert.strictEqual(this.service.companyName, 'Acme');
            assert.strictEqual(this.service.roleName, 'Admin');
        });
    });
});

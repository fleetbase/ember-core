import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr, belongsTo } from '@ember-data/model';
import { getBrowserTimezone } from '@fleetbase/ember-core/utils/lookup-user-ip';

const WHOIS_CACHE_KEY = 'fleetbase:whois';

/**
 * The loading flows: `load` for a normal boot, `promiseUser` for a route that
 * must have a user, and the preference loaders each of them drives.
 *
 * `loadWhois` reaches the network through lookupUserIp, which uses the global
 * fetch — so that is swapped here rather than stubbed on the service, and the
 * whois cache is cleared so a previous test's result cannot satisfy it.
 */
class RoleModel extends Model {
    @attr('string') name;
}

class UserModel extends Model {
    @attr('string') name;
    @attr('string') locale;
    @attr('string') company_uuid;
    // getUserSnapshot serializes the role, so it has to be a real record.
    @belongsTo('role', { async: false, inverse: null }) role;
}

class CompanyModel extends Model {
    @attr('string') name;
}

module('Unit | Service | current-user (loading)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.isAuthenticated = true;
        this.gets = [];
        this.notified = [];
        this.themeCalls = [];
        this.trackedUsers = [];
        const testContext = this;

        this.owner.register(
            'service:session',
            class extends Service {
                get isAuthenticated() {
                    return testContext.isAuthenticated;
                }
                data = { authenticated: { user: 'user-1' } };
            }
        );

        this.owner.register(
            'service:fetch',
            class extends Service {
                get(path, query, options) {
                    testContext.gets.push({ path, query, options });
                    const responder = testContext.responses[path];
                    if (!responder) {
                        return Promise.reject(new Error(`no stub for ${path}`));
                    }
                    return typeof responder === 'function' ? responder() : Promise.resolve(responder);
                }
            }
        );

        this.owner.register(
            'service:notifications',
            class extends Service {
                serverError(error) {
                    testContext.notified.push({ level: 'error', error });
                }
                warning(message) {
                    testContext.notified.push({ level: 'warning', message });
                }
            }
        );

        this.owner.register(
            'service:theme',
            class extends Service {
                syncThemeFromCurrentUser() {
                    testContext.themeCalls.push('sync');
                }
                setEnvironment() {
                    testContext.themeCalls.push('environment');
                }
            }
        );

        this.owner.register(
            'service:events',
            class extends Service {
                trackUserLoaded(user, organization) {
                    testContext.trackedUsers.push({ user, organization });
                }
                trackEvent() {}
            }
        );

        this.owner.register(
            'service:intl',
            class extends Service {
                setLocale() {}
            }
        );

        this.owner.register('service:universe', class extends Service {});
        this.owner.register('model:user', UserModel);
        this.owner.register('model:role', RoleModel);
        this.owner.register('model:company', CompanyModel);

        this.responses = {
            'users/locale': { locale: 'en-us' },
            'auth/organizations': [],
        };

        // lookupUserIp goes through the global fetch; keep it off the network.
        this.originalFetch = window.fetch;
        window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ city: 'Kuala Lumpur', timezone: 'Asia/Kuala_Lumpur' }) });
        window.localStorage.removeItem(WHOIS_CACHE_KEY);

        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:current-user');

        this.pushUser = (id, attributes = {}) =>
            this.store.push({
                data: {
                    id,
                    type: 'user',
                    attributes,
                    relationships: { role: { data: { id: `role-for-${id}`, type: 'role' } } },
                },
                included: [{ id: `role-for-${id}`, type: 'role', attributes: { name: 'Admin' } }],
            });

        this.user = this.pushUser('user-1', { name: 'Ron', company_uuid: 'company-1' });
        this.store.push({ data: { id: 'company-1', type: 'company', attributes: { name: 'Acme' } } });
    });

    hooks.afterEach(function () {
        window.fetch = this.originalFetch;
        window.localStorage.removeItem(WHOIS_CACHE_KEY);
    });

    module('load', function () {
        test('an unauthenticated session loads nothing', async function (assert) {
            this.isAuthenticated = false;
            this.store.findRecord = () => Promise.reject(new Error('should not be called'));

            assert.strictEqual(await this.service.load(), null);
        });

        test('it fetches the current user and returns it', async function (assert) {
            this.store.findRecord = () => Promise.resolve(this.user);

            const user = await this.service.load();

            assert.strictEqual(user, this.user);
            assert.strictEqual(this.service.user, this.user, 'and records it on the service');
        });

        test('it asks the store for the me record', async function (assert) {
            const calls = [];
            this.store.findRecord = (...args) => {
                calls.push(args);
                return Promise.resolve(this.user);
            };

            await this.service.load();

            assert.deepEqual(calls[0].slice(0, 2), ['user', 'me']);
        });

        test('it loads preferences on the way through', async function (assert) {
            this.store.findRecord = () => Promise.resolve(this.user);

            await this.service.load();

            assert.true(
                this.gets.some((g) => g.path === 'auth/organizations'),
                'organizations are loaded'
            );
            assert.deepEqual(this.service.whoisData.city, 'Kuala Lumpur', 'and whois');
        });
    });

    module('promiseUser', function () {
        test('an unauthenticated session rejects', async function (assert) {
            this.isAuthenticated = false;

            await assert.rejects(this.service.promiseUser(), /Failed to authenticate user/);
        });

        test('it queries for the current user', async function (assert) {
            const calls = [];
            this.store.queryRecord = (...args) => {
                calls.push(args);
                return Promise.resolve(this.user);
            };

            const user = await this.service.promiseUser();

            assert.deepEqual(calls[0], ['user', { me: true }]);
            assert.strictEqual(user, this.user);
        });

        test('the resolved callback receives the user', async function (assert) {
            this.store.queryRecord = () => Promise.resolve(this.user);
            const seen = [];

            await this.service.promiseUser({ onUserResolved: (user) => seen.push(user) });

            assert.deepEqual(seen, [this.user]);
        });

        test('a non-function callback is ignored', async function (assert) {
            this.store.queryRecord = () => Promise.resolve(this.user);

            await this.service.promiseUser({ onUserResolved: 'not a function' });

            assert.strictEqual(this.service.user, this.user);
        });

        test('a failed query is rethrown', async function (assert) {
            const boom = new Error('offline');
            this.store.queryRecord = () => Promise.reject(boom);

            await assert.rejects(this.service.promiseUser(), (error) => error === boom);
        });
    });

    module('setUser', function () {
        test('it records the user and a serialized snapshot', async function (assert) {
            await this.service.setUser(this.user);

            assert.strictEqual(this.service.user, this.user);
            assert.strictEqual(this.service.userSnapshot.name, 'Ron');
            assert.strictEqual(this.service.id, 'user-1', 'the snapshot id comes from the uuid');
        });

        test('it syncs the theme and the environment', async function (assert) {
            await this.service.setUser(this.user);

            assert.deepEqual(this.themeCalls, ['sync', 'environment']);
        });

        test('it announces the user with their organization', async function (assert) {
            await this.service.setUser(this.user);

            assert.strictEqual(this.trackedUsers[0].user, this.user);
            assert.strictEqual(this.trackedUsers[0].organization.name, 'Acme', 'resolved from company_uuid');
        });

        test('a user carrying a locale short-circuits the locale request', async function (assert) {
            const user = this.pushUser('user-2', { name: 'Ada', locale: 'fr-fr' });

            await this.service.setUser(user);

            assert.strictEqual(this.service.locale, 'fr-fr');
            assert.false(
                this.gets.some((g) => g.path === 'users/locale'),
                'no request was needed'
            );
        });

        test('a user without a locale triggers the locale request', async function (assert) {
            await this.service.setUser(this.user);

            assert.true(this.gets.some((g) => g.path === 'users/locale'));
        });
    });

    module('preference loaders', function () {
        test('the locale is stored and applied', async function (assert) {
            this.responses['users/locale'] = { locale: 'fr-fr' };

            const locale = await this.service.loadLocale();

            assert.strictEqual(locale, 'fr-fr');
            assert.strictEqual(this.service.locale, 'fr-fr');
        });

        test('a failed locale request is reported, not thrown', async function (assert) {
            this.responses['users/locale'] = () => Promise.reject(new Error('offline'));

            await this.service.loadLocale();

            assert.strictEqual(this.notified[0].level, 'error');
        });

        test('organizations are stored on the service and in options', async function (assert) {
            this.responses['auth/organizations'] = [{ id: 'company-1' }];

            const organizations = await this.service.loadOrganizations();

            assert.deepEqual(organizations, [{ id: 'company-1' }]);
            assert.deepEqual(this.service.organizations, [{ id: 'company-1' }]);
            assert.deepEqual(this.service.getOption('organizations'), [{ id: 'company-1' }]);
        });

        test('organizations are requested as ember-data records', async function (assert) {
            await this.service.loadOrganizations();

            const call = this.gets.find((g) => g.path === 'auth/organizations');
            assert.true(call.options.normalizeToEmberData);
            assert.strictEqual(call.options.normalizeModelType, 'company');
        });

        test('a failed organizations request is reported, not thrown', async function (assert) {
            this.responses['auth/organizations'] = () => Promise.reject(new Error('offline'));

            await this.service.loadOrganizations();

            assert.strictEqual(this.notified[0].level, 'error');
        });

        test('whois is stored on the service and in options', async function (assert) {
            const whois = await this.service.loadWhois();

            assert.strictEqual(whois.city, 'Kuala Lumpur');
            assert.strictEqual(this.service.whoisData.city, 'Kuala Lumpur');
            assert.strictEqual(this.service.getOption('whois').city, 'Kuala Lumpur');
        });

        test('loadPreferences drives all three', async function (assert) {
            await this.service.loadPreferences();

            assert.true(this.gets.some((g) => g.path === 'users/locale'));
            assert.true(this.gets.some((g) => g.path === 'auth/organizations'));
            assert.ok(this.service.whoisData.city);
        });
    });

    module('user lifecycle events', function () {
        test('refreshUser updates the snapshot and announces it', async function (assert) {
            const seen = [];
            this.service.trigger = (name, ...args) => seen.push({ name, args });

            await this.service.refreshUser(this.user);

            assert.strictEqual(this.service.user, this.user);
            assert.strictEqual(seen[0].name, 'user.updated');
        });

        test('switchOrganization records the company and announces it', function (assert) {
            const seen = [];
            this.service.trigger = (name, ...args) => seen.push({ name, args });
            const organization = this.store.peekRecord('company', 'company-1');

            this.service.switchOrganization(organization);

            assert.strictEqual(this.service.company, organization);
            assert.strictEqual(seen[0].name, 'user.organization_switched');
        });
    });

    module('company lookup', function () {
        test('loadCompany returns an already-loaded company without fetching', async function (assert) {
            this.service.user = { company_uuid: 'company-1' };
            this.store.findRecord = () => Promise.reject(new Error('should not be called'));

            const company = await this.service.loadCompany();

            assert.strictEqual(company.name, 'Acme');
        });

        test('loadCompany fetches one that is not in the store', async function (assert) {
            this.service.user = { company_uuid: 'company-2' };
            const fetched = { id: 'company-2' };
            this.store.findRecord = () => Promise.resolve(fetched);

            assert.strictEqual(await this.service.loadCompany(), fetched);
        });
    });

    test('the browser timezone is available as a fallback', function (assert) {
        assert.strictEqual(getBrowserTimezone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
});

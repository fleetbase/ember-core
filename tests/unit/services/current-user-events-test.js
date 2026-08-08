import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr, belongsTo } from '@ember-data/model';
import { set } from '@ember/object';

/**
 * The three places current-user broadcasts a user event. Each fires on its own
 * Evented bus, then optionally through the events service, then optionally
 * straight onto the universe bus — and both of those are guarded, because an
 * engine may boot without them.
 *
 * CurrentUserService is a CLASSIC class, so `set` is what reaches an injected
 * property; a plain assignment does not.
 */
class RoleModel extends Model {
    @attr('string') name;
}

class CompanyModel extends Model {
    @attr('string') name;
}

class UserModel extends Model {
    @attr('string') name;
    @attr('string') company_uuid;
    @attr('string') locale;
    @belongsTo('role', { async: false, inverse: null }) role;
}

module('Unit | Service | current-user (events)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.tracked = [];
        this.universeEvents = [];
        this.ownEvents = [];
        const testContext = this;

        this.owner.register(
            'service:events',
            class extends Service {
                trackUserLoaded(user, organization) {
                    testContext.tracked.push({ event: 'user.loaded', user, organization });
                }
                trackEvent(name, properties) {
                    testContext.tracked.push({ event: name, properties });
                }
            }
        );

        this.owner.register(
            'service:universe',
            class extends Service {
                trigger(name, ...args) {
                    testContext.universeEvents.push({ name, args });
                }
            }
        );

        // setUser reaches both of these on its way to the events, and a bare
        // stub would throw inside an async method whose rejection nothing here
        // would surface.
        this.owner.register(
            'service:theme',
            class extends Service {
                syncThemeFromCurrentUser() {}
            }
        );
        this.owner.register(
            'service:intl',
            class extends Service {
                setLocale() {}
            }
        );

        for (const name of ['fetch', 'session', 'socket', 'notifications']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('model:role', RoleModel);
        this.owner.register('model:company', CompanyModel);
        this.owner.register('model:user', UserModel);

        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:current-user');

        // CurrentUserService really is Evented, so the local bus is subscribed
        // to rather than stubbed — assigning over a mixin method on a classic
        // class does not shadow it, and `on` tests the actual bus anyway.
        for (const name of ['user.loaded', 'user.updated', 'user.organization_switched']) {
            this.service.on(name, (...args) => this.ownEvents.push({ name, args }));
        }

        this.company = this.store.push({ data: { id: 'company-1', type: 'company', attributes: { name: 'Acme' } } });
        this.user = this.store.push({
            data: {
                id: 'user-1',
                type: 'user',
                attributes: { name: 'Ada', company_uuid: 'company-1', locale: 'en-us' },
                relationships: { role: { data: { id: 'role-1', type: 'role' } } },
            },
            included: [{ id: 'role-1', type: 'role', attributes: { name: 'Admin' } }],
        });
    });

    module('setUser', function () {
        test('it fires on all three buses', async function (assert) {
            await this.service.setUser(this.user);

            assert.deepEqual(
                this.ownEvents.map((e) => e.name),
                ['user.loaded']
            );
            assert.strictEqual(this.tracked[0].event, 'user.loaded');
            assert.strictEqual(this.tracked[0].organization, this.company, 'the organization is resolved from the store');
            assert.strictEqual(this.universeEvents[0].name, 'user.loaded');
        });

        test('no events service still reaches the universe bus', async function (assert) {
            set(this.service, 'events', null);

            await this.service.setUser(this.user);

            assert.deepEqual(this.tracked, []);
            assert.strictEqual(this.universeEvents[0].name, 'user.loaded');
        });

        test('no universe still reaches the events service', async function (assert) {
            set(this.service, 'universe', null);

            await this.service.setUser(this.user);

            assert.strictEqual(this.tracked[0].event, 'user.loaded');
            assert.deepEqual(this.universeEvents, []);
        });

        test('neither one leaves only the local bus', async function (assert) {
            set(this.service, 'events', null);
            set(this.service, 'universe', null);

            await this.service.setUser(this.user);

            assert.deepEqual(
                this.ownEvents.map((e) => e.name),
                ['user.loaded'],
                'the backward-compatible bus always fires'
            );
        });
    });

    module('refreshUser', function () {
        test('it reports the user and organization', async function (assert) {
            await this.service.refreshUser(this.user);

            assert.deepEqual(
                this.ownEvents.map((e) => e.name),
                ['user.updated']
            );
            assert.strictEqual(this.tracked[0].event, 'user.updated');
            assert.strictEqual(this.tracked[0].properties.user_id, 'user-1');
            assert.strictEqual(this.tracked[0].properties.organization_id, 'company-1');
            assert.strictEqual(this.tracked[0].properties.organization_name, 'Acme');
        });

        test('it is skipped when there is no events service', async function (assert) {
            set(this.service, 'events', null);

            await this.service.refreshUser(this.user);

            assert.deepEqual(this.tracked, []);
            assert.strictEqual(this.universeEvents[0].name, 'user.updated');
        });

        test('the universe half is skipped when there is no universe', async function (assert) {
            set(this.service, 'universe', null);

            await this.service.refreshUser(this.user);

            assert.deepEqual(this.universeEvents, []);
            assert.strictEqual(this.tracked[0].event, 'user.updated');
        });
    });

    module('switchOrganization', function () {
        test('it records the new organization and announces it', function (assert) {
            this.service.switchOrganization(this.company);

            assert.strictEqual(this.service.company, this.company);
            assert.deepEqual(
                this.ownEvents.map((e) => e.name),
                ['user.organization_switched']
            );
            assert.strictEqual(this.tracked[0].properties.organization_id, 'company-1');
            assert.strictEqual(this.tracked[0].properties.organization_name, 'Acme');
            assert.strictEqual(this.universeEvents[0].name, 'user.organization_switched');
        });

        test('no events service still switches and reaches the universe', function (assert) {
            set(this.service, 'events', null);

            this.service.switchOrganization(this.company);

            assert.strictEqual(this.service.company, this.company);
            assert.deepEqual(this.tracked, []);
            assert.strictEqual(this.universeEvents[0].name, 'user.organization_switched');
        });

        test('no universe still switches and reaches the events service', function (assert) {
            set(this.service, 'universe', null);

            this.service.switchOrganization(this.company);

            assert.strictEqual(this.tracked[0].event, 'user.organization_switched');
            assert.deepEqual(this.universeEvents, []);
        });

        test('switching to nothing is tolerated', function (assert) {
            this.service.switchOrganization(null);

            assert.strictEqual(this.tracked[0].properties.organization_id, undefined);
            assert.strictEqual(this.tracked[0].properties.organization_name, undefined);
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import SessionService from '@fleetbase/ember-core/services/session';

/**
 * handleInvalidation was left uncovered for most of this campaign on the
 * grounds that `super.handleInvalidation` might navigate and take the whole
 * test page with it. That has now been checked rather than assumed —
 * ember-simple-auth 6.1's handleSessionInvalidated is:
 *
 *   if (isFastBoot(owner)) { router.transitionTo(route) }
 *   else { if (!isTesting()) { location.replace(route) } }
 *
 * so under `ember test` the super call is a no-op and this is safe to drive.
 */
module('Unit | Service | session (invalidation)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.terminated = [];
        this.fired = [];
        this.setups = [];
        const testContext = this;

        this.owner.register(
            'service:events',
            class extends Service {
                trackSessionTerminated(durationSeconds) {
                    testContext.terminated.push(durationSeconds);
                }
            }
        );

        for (const name of ['router', 'fetch', 'notifications', 'intl', 'current-user', 'universe']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('service:fleetbase-session', SessionService);
        this.service = this.owner.lookup('service:fleetbase-session');
        this.service._fireSessionEvent = (name, payload) => this.fired.push({ name, payload });

        Object.defineProperty(this.service, 'session', {
            value: {
                _setup: (...args) => {
                    testContext.setups.push(args);
                    return Promise.resolve('set up');
                },
                invalidate: () => Promise.resolve(),
            },
            configurable: true,
            writable: true,
        });
    });

    module('handleInvalidation', function () {
        test('it reports how long the session lasted', function (assert) {
            this.service._sessionStartedAt = Date.now() - 5000;

            this.service.handleInvalidation('/');

            assert.strictEqual(this.terminated.length, 1);
            assert.true(this.terminated[0] >= 4 && this.terminated[0] <= 7, `about five seconds, got ${this.terminated[0]}`);
        });

        test('a session that never started reports a null duration', function (assert) {
            assert.strictEqual(this.service._sessionStartedAt, null);

            this.service.handleInvalidation('/');

            assert.deepEqual(this.terminated, [null]);
        });

        test('it fires user.deauthenticated with the same duration', function (assert) {
            this.service._sessionStartedAt = Date.now() - 2000;

            this.service.handleInvalidation('/');

            assert.strictEqual(this.fired[0].name, 'user.deauthenticated');
            assert.strictEqual(this.fired[0].payload.session_duration, this.terminated[0], 'the two agree');
        });

        test('it clears the start time so a later logout reports null', function (assert) {
            this.service._sessionStartedAt = Date.now() - 1000;

            this.service.handleInvalidation('/');
            this.service.handleInvalidation('/');

            assert.strictEqual(this.service._sessionStartedAt, null);
            assert.strictEqual(this.terminated[1], null);
        });

        test('a missing events service does not stop the universe event', function (assert) {
            Object.defineProperty(this.service, 'events', { value: null, configurable: true });

            this.service.handleInvalidation('/');

            assert.deepEqual(this.terminated, [], 'nothing was tracked');
            assert.strictEqual(this.fired[0].name, 'user.deauthenticated', 'but the event still fired');
        });
    });

    module('manuallyAuthenticate', function () {
        test('it sets the session up with the fleetbase authenticator and a token', async function (assert) {
            const result = await this.service.manuallyAuthenticate('a-token');

            assert.strictEqual(result, 'set up');
            assert.deepEqual(this.setups, [['authenticator:fleetbase', { token: 'a-token' }, true]]);
        });

        test('the third argument asks for the authentication event to be fired', async function (assert) {
            await this.service.manuallyAuthenticate('a-token');

            assert.true(this.setups[0][2], 'so handleAuthentication still runs for a manual login');
        });
    });
});

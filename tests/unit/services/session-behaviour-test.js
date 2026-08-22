import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import SessionService from '@fleetbase/ember-core/services/session';

/**
 * The session service extends ember-simple-auth's. It is registered under a
 * distinct name because this addon re-exports app/services/session.js to the
 * path ember-simple-auth already owns, so a plain `service:session` lookup does
 * not reliably resolve to this subclass — the app-tree collision recorded
 * elsewhere in this branch.
 *
 * `data` is a read-only computed on the parent, so it is redefined per test.
 */
module('Unit | Service | session (fleetbase behaviour)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.tracked = [];
        this.triggered = [];
        this.gets = [];
        const testContext = this;

        this.owner.register(
            'service:events',
            class extends Service {
                trackEvent(name, props) {
                    testContext.tracked.push({ name, props });
                }
            }
        );

        this.owner.register(
            'service:universe',
            class extends Service {
                trigger(name, props) {
                    testContext.triggered.push({ name, props });
                }
            }
        );

        this.owner.register(
            'service:fetch',
            class extends Service {
                get(path, query) {
                    testContext.gets.push({ path, query });
                    return testContext.twoFactorResult ?? Promise.resolve({ twoFaEnabled: false });
                }
            }
        );

        for (const name of ['current-user', 'notifications', 'router', 'intl', 'loader']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('service:fleetbase-session', SessionService);
        this.service = this.owner.lookup('service:fleetbase-session');

        this.setData = (data) => Object.defineProperty(this.service, 'data', { value: data, configurable: true, writable: true });
    });

    module('flags and redirects', function () {
        test('isOnboarding sets the flag and chains', function (assert) {
            assert.strictEqual(this.service.isOnboarding(), this.service);
            assert.true(this.service._isOnboarding);
        });

        test('setRedirect defaults to the console', function (assert) {
            this.service.setRedirect();

            assert.strictEqual(this.service.redirectTo, 'console');
        });

        test('setRedirect takes an explicit destination', function (assert) {
            this.service.setRedirect('console.settings');

            assert.strictEqual(this.service.redirectTo, 'console.settings');
        });

        test('the session start time is unset until authentication', function (assert) {
            assert.strictEqual(this.service._sessionStartedAt, null);
        });
    });

    module('expiry', function () {
        test('the expiry date is read from the session data', function (assert) {
            this.setData({ authenticated: { expires_at: '2026-06-01T00:00:00.000Z' } });

            assert.strictEqual(this.service.getExpiresAtDate().toISOString(), '2026-06-01T00:00:00.000Z');
        });

        test('an absent expiry yields an invalid date', function (assert) {
            this.setData({ authenticated: {} });

            assert.true(Number.isNaN(this.service.getExpiresAtDate().getTime()));
        });

        test('seconds remaining comes back negative for a future expiry', function (assert) {
            // Pinned, not fixed. The subtraction is `now - expiry`, so a session
            // that expires in the future reports a negative number of seconds
            // remaining and one that has already expired reports a positive one.
            // The operands are the wrong way round.
            const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
            this.setData({ authenticated: { expires_at: inOneHour.toISOString() } });

            const remaining = this.service.getSessionSecondsRemaining();

            assert.true(remaining < 0, `${remaining} is negative for a session that has not expired`);
            assert.true(Math.abs(remaining + 3600) < 5, 'the magnitude is right, only the sign is wrong');
        });

        test('an already-expired session reports a positive number', function (assert) {
            const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            this.setData({ authenticated: { expires_at: anHourAgo.toISOString() } });

            assert.true(this.service.getSessionSecondsRemaining() > 0, 'the inversion again, from the other side');
        });
    });

    module('two factor', function () {
        test('it asks the two-fa endpoint for the identity', async function (assert) {
            await this.service.checkForTwoFactor('ron@example.com');

            assert.deepEqual(this.gets, [{ path: 'two-fa/check', query: { identity: 'ron@example.com' } }]);
        });

        test('it resolves with the response', async function (assert) {
            this.twoFactorResult = Promise.resolve({ twoFaEnabled: true });

            assert.deepEqual(await this.service.checkForTwoFactor('ron@example.com'), { twoFaEnabled: true });
        });

        test('a failure is rethrown carrying the original message', async function (assert) {
            this.twoFactorResult = Promise.reject(new Error('no such identity'));

            await assert.rejects(this.service.checkForTwoFactor('nobody'), /no such identity/);
        });
    });

    module('session events', function () {
        test('an event reaches both the events service and the universe bus', function (assert) {
            this.service._fireSessionEvent('session.authenticated', { userId: 'user-1' });

            assert.deepEqual(this.tracked, [{ name: 'session.authenticated', props: { userId: 'user-1' } }]);
            assert.deepEqual(this.triggered, [{ name: 'session.authenticated', props: { userId: 'user-1' } }]);
        });

        test('extra props default to empty', function (assert) {
            this.service._fireSessionEvent('session.authenticated');

            assert.deepEqual(this.tracked[0].props, {});
        });

        test('a missing events service does not stop the universe broadcast', function (assert) {
            this.service.events = null;

            this.service._fireSessionEvent('user.deauthenticated');

            assert.deepEqual(this.triggered, [{ name: 'user.deauthenticated', props: {} }]);
        });

        test('a missing universe does not stop the events broadcast', function (assert) {
            this.service.universe = null;

            this.service._fireSessionEvent('user.deauthenticated');

            assert.deepEqual(this.tracked, [{ name: 'user.deauthenticated', props: {} }]);
        });
    });
});

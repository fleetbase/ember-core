import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import SessionService from '@fleetbase/ember-core/services/session';

// ember-simple-auth ships its own app/services/session.js, which collides with
// this addon's re-export of the same path, so `service:session` does not resolve
// to the subclass under test. Registering it explicitly pins the unit under test.
// Same collision as notifications (ember-cli-notifications) and abilities (ember-can).
module('Unit | Service | session', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.tracked = [];
        this.triggered = [];
        this.fetched = [];
        this.fetchResponse = Promise.resolve({ twoFaEnabled: false });
        const testContext = this;

        this.owner.register(
            'service:events',
            class extends Service {
                trackEvent(name, props) {
                    testContext.tracked.push({ name, props });
                }
                trackSessionTerminated(duration) {
                    testContext.tracked.push({ name: 'session.terminated', duration });
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
                get(uri, params) {
                    testContext.fetched.push({ uri, params });
                    return testContext.fetchResponse;
                }
            }
        );

        this.owner.register('service:current-user', class extends Service {});
        this.owner.register('service:notifications', class extends Service {});

        this.owner.register('service:fleetbase-session', SessionService);
        this.service = this.owner.lookup('service:fleetbase-session');

        // `data` is a read-only computed on the ember-simple-auth base class.
        this.setSessionData = (data) => Object.defineProperty(this.service, 'data', { value: data, configurable: true });
    });

    hooks.afterEach(function () {
        document.querySelectorAll('.overloader').forEach((node) => node.remove());
    });

    module('redirect target', function () {
        test('it defaults to the console', function (assert) {
            assert.strictEqual(this.service.redirectTo, 'console');
        });

        test('setRedirect changes it, and defaults back to console', function (assert) {
            this.service.setRedirect('console.orders');
            assert.strictEqual(this.service.redirectTo, 'console.orders');

            this.service.setRedirect();
            assert.strictEqual(this.service.redirectTo, 'console');
        });
    });

    module('onboarding', function () {
        test('isOnboarding marks the flag and returns the service for chaining', function (assert) {
            assert.false(this.service._isOnboarding);
            assert.strictEqual(this.service.isOnboarding(), this.service);
            assert.true(this.service._isOnboarding);
        });
    });

    module('the loader', function () {
        test('showLoader appends an overlay carrying the message', function (assert) {
            const loader = this.service.showLoader('Starting session...');

            assert.true(loader.classList.contains('overloader'));
            assert.true(document.body.contains(loader));
            assert.true(loader.textContent.includes('Starting session...'));
        });

        test('each call appends its own overlay', function (assert) {
            this.service.showLoader('One');
            this.service.showLoader('Two');

            assert.strictEqual(document.querySelectorAll('.overloader').length, 2);
        });
    });

    module('session expiry', function () {
        test('getExpiresAtDate reads the authenticated payload', function (assert) {
            this.setSessionData({ authenticated: { expires_at: '2026-01-15T09:30:00.000Z' } });

            assert.strictEqual(this.service.getExpiresAtDate().toISOString(), '2026-01-15T09:30:00.000Z');
        });

        test('getSessionSecondsRemaining returns a NEGATIVE number for a future expiry', function (assert) {
            // NOTE: the subtraction is the wrong way round — it computes
            // (now - expiry) rather than (expiry - now) — so a session with time
            // left reports a negative "seconds remaining", and an expired one
            // reports a positive value. Pinned rather than corrected because
            // callers may already compensate for the sign.
            this.setSessionData({ authenticated: { expires_at: new Date(Date.now() + 60_000).toISOString() } });

            const remaining = this.service.getSessionSecondsRemaining();

            assert.true(remaining < 0, `expected a negative value, got ${remaining}`);
            assert.true(Math.abs(remaining + 60) < 2, 'the magnitude is right, only the sign is wrong');
        });

        test('an already expired session reports a positive value', function (assert) {
            this.setSessionData({ authenticated: { expires_at: new Date(Date.now() - 60_000).toISOString() } });

            assert.true(this.service.getSessionSecondsRemaining() > 0);
        });
    });

    module('two factor', function () {
        test('checkForTwoFactor queries the endpoint with the identity', async function (assert) {
            const response = await this.service.checkForTwoFactor('user@example.com');

            assert.deepEqual(this.fetched, [{ uri: 'two-fa/check', params: { identity: 'user@example.com' } }]);
            assert.deepEqual(response, { twoFaEnabled: false });
        });

        test('it rethrows a failure as a plain Error', async function (assert) {
            this.fetchResponse = Promise.reject(new Error('lookup failed'));

            await assert.rejects(this.service.checkForTwoFactor('user@example.com'), /lookup failed/);
        });
    });

    module('session events', function () {
        test('_fireSessionEvent reaches both the events service and the universe', function (assert) {
            this.service._fireSessionEvent('session.authenticated', { a: 1 });

            assert.deepEqual(this.tracked, [{ name: 'session.authenticated', props: { a: 1 } }]);
            assert.deepEqual(this.triggered, [{ name: 'session.authenticated', props: { a: 1 } }]);
        });

        test('it defaults the extra properties to an empty object', function (assert) {
            this.service._fireSessionEvent('session.authenticated');

            assert.deepEqual(this.tracked[0].props, {});
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import SessionService from '@fleetbase/ember-core/services/session';

/**
 * The session flows: post-authentication redirect, current-user loading, and
 * invalidation with its loading overlay.
 *
 * `handleInvalidation` is deliberately NOT exercised. It calls
 * `super.handleInvalidation`, and ember-simple-auth's implementation is
 * responsible for the post-logout redirect — which, if it navigates, would take
 * the whole test page with it and kill the run rather than fail one assertion.
 * The package is not resolvable in this checkout, so that could not be verified
 * either way, and an unverifiable suite-wide risk is not worth a few statements.
 * Its event-firing half is covered through _fireSessionEvent in the sibling
 * session-behaviour test.
 *
 * Loader nodes are left attached where the service schedules its own removal —
 * removing them here too would make that timer's removeChild throw
 * asynchronously and land on whichever test happened to be running.
 */
module('Unit | Service | session (flows)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.transitions = [];
        this.invalidations = 0;
        this.loadResult = { id: 'user-1' };
        this.loadRejects = false;
        const testContext = this;

        this.owner.register(
            'service:router',
            class extends Service {
                transitionTo(...args) {
                    testContext.transitions.push(args);
                    return testContext.transitionRejects ? Promise.reject(new Error('route not found')) : Promise.resolve('transitioned');
                }
            }
        );

        this.owner.register(
            'service:current-user',
            class extends Service {
                load() {
                    return testContext.loadRejects ? Promise.reject(new Error('load failed')) : Promise.resolve(testContext.loadResult);
                }
                promiseUser() {
                    return testContext.loadRejects ? Promise.reject(new Error('promise failed')) : Promise.resolve(testContext.loadResult);
                }
            }
        );

        for (const name of ['fetch', 'notifications', 'intl', 'events', 'universe']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('service:fleetbase-session', SessionService);
        this.service = this.owner.lookup('service:fleetbase-session');
        this.service._fireSessionEvent = () => {};

        // ember-simple-auth's internal session object owns invalidate().
        Object.defineProperty(this.service, 'session', {
            value: {
                invalidate: () => {
                    testContext.invalidations += 1;
                    return Promise.resolve();
                },
            },
            configurable: true,
            writable: true,
        });
    });

    module('showLoader', function () {
        test('it appends an overlay carrying the message', function (assert) {
            const loader = this.service.showLoader('Starting session...');

            try {
                assert.strictEqual(loader.parentNode, document.body);
                assert.true(loader.classList.contains('overloader'));
                assert.true(loader.innerHTML.includes('Starting session...'));
            } finally {
                // showLoader schedules no removal of its own, so this one is
                // safe to take away here.
                loader.remove();
            }
        });

        test('each call builds its own node', function (assert) {
            const first = this.service.showLoader('One');
            const second = this.service.showLoader('Two');

            try {
                assert.notStrictEqual(first, second);
            } finally {
                first.remove();
                second.remove();
            }
        });
    });

    module('handleAuthentication', function () {
        test('it records when the session started', async function (assert) {
            assert.strictEqual(this.service._sessionStartedAt, null);

            await this.service.handleAuthentication();

            assert.true(typeof this.service._sessionStartedAt === 'number');
        });

        test('it transitions to the redirect target', async function (assert) {
            this.service.setRedirect('console.settings');

            await this.service.handleAuthentication();

            assert.deepEqual(this.transitions, [['console.settings']]);
        });

        test('it defaults to the console', async function (assert) {
            await this.service.handleAuthentication();

            assert.deepEqual(this.transitions, [['console']]);
        });

        test('onboarding skips the redirect entirely', async function (assert) {
            this.service.isOnboarding();

            await this.service.handleAuthentication();

            assert.deepEqual(this.transitions, [], 'the onboarding flow routes itself');
            assert.true(typeof this.service._sessionStartedAt === 'number', 'but the session still starts');
        });

        test('a failed transition is swallowed rather than thrown', async function (assert) {
            this.transitionRejects = true;

            await this.service.handleAuthentication();

            assert.deepEqual(this.transitions.length, 1, 'it was attempted and the failure absorbed');
        });

        test('it fires the authenticated event', async function (assert) {
            const fired = [];
            this.service._fireSessionEvent = (name) => fired.push(name);

            await this.service.handleAuthentication();

            assert.deepEqual(fired, ['session.authenticated']);
        });
    });

    module('loadCurrentUser', function () {
        test('it returns the loaded user', async function (assert) {
            assert.strictEqual(await this.service.loadCurrentUser(), this.loadResult);
            assert.strictEqual(this.invalidations, 0);
        });

        test('no user invalidates the session', async function (assert) {
            this.loadResult = null;

            await this.service.loadCurrentUser();

            assert.strictEqual(this.invalidations, 1);
        });

        test('a failed load invalidates the session', async function (assert) {
            this.loadRejects = true;

            await this.service.loadCurrentUser();

            assert.strictEqual(this.invalidations, 1);
        });
    });

    module('promiseCurrentUser', function () {
        test('it returns the user', async function (assert) {
            assert.strictEqual(await this.service.promiseCurrentUser(), this.loadResult);
            assert.strictEqual(this.invalidations, 0);
        });

        test('no user aborts the transition, invalidates and throws', async function (assert) {
            this.loadResult = null;
            let aborted = 0;
            const transition = { abort: () => (aborted += 1) };

            await assert.rejects(this.service.promiseCurrentUser(transition), /Session authentication failed/);

            assert.strictEqual(aborted, 1);
            assert.strictEqual(this.invalidations, 1);
        });

        test('a failed promise aborts and rethrows the original error', async function (assert) {
            this.loadRejects = true;
            let aborted = 0;

            await assert.rejects(this.service.promiseCurrentUser({ abort: () => (aborted += 1) }), /promise failed/);

            assert.strictEqual(aborted, 1);
            assert.strictEqual(this.invalidations, 1);
        });

        test('it copes with no transition to abort', async function (assert) {
            this.loadRejects = true;

            await assert.rejects(this.service.promiseCurrentUser(), /promise failed/);

            assert.strictEqual(this.invalidations, 1);
        });
    });

    module('invalidateWithLoader', function () {
        test('it shows an overlay and invalidates', async function (assert) {
            await this.service.invalidateWithLoader('Ending session...');

            assert.strictEqual(this.invalidations, 1);
            assert.true(this.service.isLoaderNodeOpen, 'the flag stays set until the scheduled removal runs');
        });

        test('an already-open loader is not stacked', async function (assert) {
            this.service.isLoaderNodeOpen = true;

            await this.service.invalidateWithLoader('Ending session...');

            assert.strictEqual(this.invalidations, 1, 'it still invalidates');
        });

        test('the message is optional', async function (assert) {
            await this.service.invalidateWithLoader();

            assert.strictEqual(this.invalidations, 1);
        });
    });
});

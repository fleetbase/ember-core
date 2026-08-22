import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import FleetbaseAuthenticator, { AuthenticationError } from '@fleetbase/ember-core/authenticators/fleetbase';

/**
 * The authenticator is delegation over the `fetch` service: it decides which
 * endpoint to call, what to send, and which responses count as failures.
 * A stubbed fetch records the calls and returns whatever a test needs.
 */
module('Unit | Authenticator | fleetbase', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.gets = [];
        this.posts = [];
        this.getResponse = {};
        this.postResponse = {};
        const testContext = this;

        this.owner.register(
            'service:fetch',
            class extends Service {
                get(path, query, options) {
                    testContext.gets.push({ path, query, options });
                    return Promise.resolve(testContext.getResponse);
                }
                post(path, body, options) {
                    testContext.posts.push({ path, body, options });
                    return Promise.resolve(testContext.postResponse);
                }
            }
        );

        this.owner.register('service:session', class extends Service {});
        this.owner.register('authenticator:fleetbase', FleetbaseAuthenticator);
        this.authenticator = this.owner.lookup('authenticator:fleetbase');
    });

    module('AuthenticationError', function () {
        test('it carries a message and a code', function (assert) {
            const error = new AuthenticationError('Nope', 'bad_credentials');

            assert.strictEqual(error.message, 'Nope');
            assert.strictEqual(error.code, 'bad_credentials');
            assert.strictEqual(error.getCode(), 'bad_credentials');
        });

        test('it is a real Error', function (assert) {
            assert.true(new AuthenticationError('Nope') instanceof Error);
        });

        test('the code is optional', function (assert) {
            assert.strictEqual(new AuthenticationError('Nope').getCode(), undefined);
        });
    });

    module('restore', function () {
        test('it asks the session endpoint with the stored token', async function (assert) {
            await this.authenticator.restore({ token: 'abc123' });

            assert.deepEqual(this.gets, [{ path: 'auth/session', query: {}, options: { headers: { Authorization: 'Bearer abc123' } } }]);
        });

        test('it resolves with the response', async function (assert) {
            this.getResponse = { token: 'renewed', restore: true };

            assert.deepEqual(await this.authenticator.restore({ token: 'abc123' }), { token: 'renewed', restore: true });
        });

        test('an explicit restore false is rejected', async function (assert) {
            this.getResponse = { restore: false, error: 'Session expired' };

            await assert.rejects(this.authenticator.restore({ token: 'abc123' }), (error) => error instanceof AuthenticationError && error.message === 'Session expired');
        });

        test('only an exact false rejects', async function (assert) {
            this.getResponse = { restore: null };

            assert.deepEqual(await this.authenticator.restore({ token: 'abc123' }), { restore: null }, 'a missing flag is not a failure');
        });
    });

    module('authenticate', function () {
        test('it posts the credentials to the login endpoint', async function (assert) {
            await this.authenticator.authenticate({ email: 'a@b.c', password: 'secret' });

            assert.deepEqual(this.posts, [{ path: 'auth/login', body: { email: 'a@b.c', password: 'secret', remember: false }, options: {} }]);
        });

        test('remember is passed through', async function (assert) {
            await this.authenticator.authenticate({ email: 'a@b.c' }, true);

            assert.true(this.posts[0].body.remember);
        });

        test('a custom path and options are honoured', async function (assert) {
            await this.authenticator.authenticate({}, false, 'auth/sso', { headers: { 'X-Tenant': 'acme' } });

            assert.strictEqual(this.posts[0].path, 'auth/sso');
            assert.deepEqual(this.posts[0].options, { headers: { 'X-Tenant': 'acme' } });
        });

        test('it defaults to empty credentials', async function (assert) {
            await this.authenticator.authenticate();

            assert.deepEqual(this.posts[0].body, { remember: false });
        });

        test('it resolves with the response', async function (assert) {
            this.postResponse = { token: 'abc123' };

            assert.deepEqual(await this.authenticator.authenticate({}), { token: 'abc123' });
        });

        test('an errors array is rejected with its first entry and the response code', async function (assert) {
            this.postResponse = { errors: ['Invalid password', 'ignored'], code: 'bad_credentials' };

            await assert.rejects(
                this.authenticator.authenticate({}),
                (error) => error instanceof AuthenticationError && error.message === 'Invalid password' && error.getCode() === 'bad_credentials'
            );
        });

        test('an empty errors array still rejects, with a fallback message', async function (assert) {
            this.postResponse = { errors: [] };

            await assert.rejects(this.authenticator.authenticate({}), (error) => error.message === 'Authentication failed!' && error.getCode() === undefined);
        });
    });

    module('invalidate', function () {
        test('it posts to the logout endpoint', async function (assert) {
            await this.authenticator.invalidate({ token: 'abc123' });

            assert.deepEqual(this.posts, [{ path: 'auth/logout', body: undefined, options: undefined }]);
        });

        test('it resolves with whatever logout returned', async function (assert) {
            this.postResponse = { ok: true };

            assert.deepEqual(await this.authenticator.invalidate({}), { ok: true });
        });
    });
});

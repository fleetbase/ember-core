import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import AdapterError from '@ember-data/adapter/error';
import { compress } from 'compress-json';
import ApplicationAdapter from '@fleetbase/ember-core/adapters/application';

const DEFAULT_ERROR_MESSAGE = 'Oops! Something went wrong. Please try again or contact support if the issue persists.';
const USER_OPTIONS_KEY = '@fleetbase/storage:user-options';
const SESSION_KEY = 'ember_simple_auth-session';

/**
 * ApplicationAdapter decides three things worth pinning: which headers go out
 * with every request, how a URL path is derived from a model name, and which
 * responses count as errors.
 *
 * There is no app/adapters/application.js re-export — the addon deliberately
 * leaves that path to the consuming app — so the class is registered directly.
 */
module('Unit | Adapter | application', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.sessionData = { authenticated: {} };
        this.isAuthenticated = false;
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

        this.owner.register('service:current-user', class extends Service {});
        this.owner.register('adapter:fleetbase-application', ApplicationAdapter);

        this.buildAdapter = () => this.owner.lookup('adapter:fleetbase-application');
        this.setUserOptions = (options) => window.localStorage.setItem(USER_OPTIONS_KEY, JSON.stringify(options));
    });

    hooks.afterEach(function () {
        window.localStorage.removeItem(USER_OPTIONS_KEY);
        window.localStorage.removeItem(SESSION_KEY);
    });

    module('headers', function () {
        test('an unauthenticated request sends only a content type', function (assert) {
            assert.deepEqual(this.buildAdapter().setupHeaders(), { 'Content-Type': 'application/json' });
        });

        test('an authenticated request carries a bearer token', function (assert) {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user: 'user-1', token: 'abc123' } };

            const headers = this.buildAdapter().setupHeaders();

            assert.strictEqual(headers['Authorization'], 'Bearer abc123');
            assert.strictEqual(headers['Content-Type'], 'application/json');
        });

        test('the token is recovered from local storage when the session has not restored yet', function (assert) {
            window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: 'from-storage' } }));

            const headers = this.buildAdapter().setupHeaders();

            assert.strictEqual(headers['Authorization'], 'Bearer from-storage', 'a page reload still sends credentials');
        });

        test('a stored session with no authenticated section is ignored', function (assert) {
            window.localStorage.setItem(SESSION_KEY, JSON.stringify({ somethingElse: true }));

            assert.deepEqual(this.buildAdapter().setupHeaders(), { 'Content-Type': 'application/json' });
        });

        test('sandbox mode adds the sandbox header', function (assert) {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user: 'user-1', token: 'abc123' } };
            this.setUserOptions({ 'user-1': { sandbox: true } });

            assert.true(this.buildAdapter().setupHeaders()['Access-Console-Sandbox']);
        });

        test('sandbox must be exactly true', function (assert) {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user: 'user-1', token: 'abc123' } };
            this.setUserOptions({ 'user-1': { sandbox: 'yes' } });

            assert.strictEqual(this.buildAdapter().setupHeaders()['Access-Console-Sandbox'], undefined);
        });

        test('a test key is sent alongside the sandbox header', function (assert) {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user: 'user-1', token: 'abc123' } };
            this.setUserOptions({ 'user-1': { sandbox: true, testKey: 'key-1' } });

            assert.strictEqual(this.buildAdapter().setupHeaders()['Access-Console-Sandbox-Key'], 'key-1');
        });

        test('sandbox options belonging to another user are not applied', function (assert) {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user: 'user-1', token: 'abc123' } };
            this.setUserOptions({ 'user-2': { sandbox: true, testKey: 'key-2' } });

            const headers = this.buildAdapter().setupHeaders();

            assert.strictEqual(headers['Access-Console-Sandbox'], undefined);
            assert.strictEqual(headers['Access-Console-Sandbox-Key'], undefined);
        });

        test('sandbox headers are withheld from an unauthenticated request', function (assert) {
            this.sessionData = { authenticated: { user: 'user-1' } };
            this.setUserOptions({ 'user-1': { sandbox: true, testKey: 'key-1' } });

            const headers = this.buildAdapter().setupHeaders();

            assert.strictEqual(headers['Access-Console-Sandbox'], undefined);
            assert.strictEqual(headers['Access-Console-Sandbox-Key'], undefined);
        });

        test('corrupt user options are ignored rather than fatal', function (assert) {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user: 'user-1', token: 'abc123' } };
            window.localStorage.setItem(USER_OPTIONS_KEY, 'not json');

            assert.strictEqual(this.buildAdapter().setupHeaders()['Authorization'], 'Bearer abc123');
        });

        test('setupHeaders both returns and installs the headers', function (assert) {
            const adapter = this.buildAdapter();

            const headers = adapter.setupHeaders();

            assert.deepEqual(adapter.headers, headers);
        });
    });

    module('ajaxOptions', function () {
        test('it sends credentials with the request', function (assert) {
            const options = this.buildAdapter().ajaxOptions('/api/v1/users', 'GET', {});

            assert.strictEqual(options.credentials, 'include');
        });

        test('it refreshes the headers first, so a login mid-session is picked up', function (assert) {
            const adapter = this.buildAdapter();
            adapter.ajaxOptions('/api/v1/users', 'GET', {});
            assert.strictEqual(adapter.headers['Authorization'], undefined);

            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user: 'user-1', token: 'abc123' } };
            adapter.ajaxOptions('/api/v1/users', 'GET', {});

            assert.strictEqual(adapter.headers['Authorization'], 'Bearer abc123');
        });
    });

    module('pathForType', function () {
        test('it pluralizes and dasherizes the model name', function (assert) {
            const adapter = this.buildAdapter();

            assert.strictEqual(adapter.pathForType('user'), 'users');
            assert.strictEqual(adapter.pathForType('orderConfig'), 'order-configs');
            assert.strictEqual(adapter.pathForType('fuel-report'), 'fuel-reports');
        });

        test('an irregular plural is honoured', function (assert) {
            assert.strictEqual(this.buildAdapter().pathForType('company'), 'companies');
        });
    });

    module('error detection', function () {
        test('4xx and 5xx are errors', function (assert) {
            const adapter = this.buildAdapter();

            for (const status of [400, 404, 422, 500, 599]) {
                assert.true(adapter.isErrorResponse(status, {}), `${status} is an error`);
            }
        });

        test('a successful status is not an error', function (assert) {
            const adapter = this.buildAdapter();

            for (const status of [200, 201, 204, 304, 399]) {
                assert.false(adapter.isErrorResponse(status, {}), `${status} is not an error`);
            }
        });

        test('a 200 carrying an errors array is still an error', function (assert) {
            assert.true(this.buildAdapter().isErrorResponse(200, { errors: ['Nope'] }));
        });

        test('a blank payload with a good status is not an error', function (assert) {
            assert.false(this.buildAdapter().isErrorResponse(200, null));
        });

        test('errors are read off the payload', function (assert) {
            assert.deepEqual(this.buildAdapter().getResponseErrors({ errors: ['First', 'Second'] }), ['First', 'Second']);
        });

        test('a payload with no errors array yields the default message', function (assert) {
            const adapter = this.buildAdapter();

            assert.deepEqual(adapter.getResponseErrors({}), [DEFAULT_ERROR_MESSAGE]);
            assert.deepEqual(adapter.getResponseErrors({ errors: 'not an array' }), [DEFAULT_ERROR_MESSAGE]);
        });

        test('the first error becomes the message', function (assert) {
            assert.strictEqual(this.buildAdapter().getErrorMessage(['First', 'Second']), 'First');
        });

        test('an empty or absent error list falls back to the default message', function (assert) {
            const adapter = this.buildAdapter();

            assert.strictEqual(adapter.getErrorMessage([]), DEFAULT_ERROR_MESSAGE);
            assert.strictEqual(adapter.getErrorMessage(), DEFAULT_ERROR_MESSAGE);
            assert.strictEqual(adapter.getErrorMessage([null]), DEFAULT_ERROR_MESSAGE);
        });
    });

    module('handleResponse', function () {
        test('an error response becomes an AdapterError carrying the message', function (assert) {
            const result = this.buildAdapter().handleResponse(422, {}, { errors: ['Name is required'] }, {});

            assert.true(result instanceof AdapterError);
            assert.strictEqual(result.message, 'Name is required');
            assert.deepEqual(result.errors, ['Name is required']);
        });

        test('an error response with no errors array uses the default message', function (assert) {
            const result = this.buildAdapter().handleResponse(500, {}, {}, {});

            assert.true(result instanceof AdapterError);
            assert.strictEqual(result.message, DEFAULT_ERROR_MESSAGE);
        });

        test('a successful response is handed to the superclass', function (assert) {
            const payload = { users: [{ id: '1' }] };

            assert.deepEqual(this.buildAdapter().handleResponse(200, {}, payload, {}), payload);
        });
    });

    module('decompressPayload', function () {
        test('a payload flagged as compressed is decompressed and parsed', function (assert) {
            const original = { users: [{ id: '1', name: 'Ron' }] };
            const compressed = compress(JSON.stringify(original));

            assert.deepEqual(this.buildAdapter().decompressPayload(compressed, { 'x-compressed-json': '1' }), original);
        });

        test('the flag is accepted as a number as well as a string', function (assert) {
            const original = { ok: true };
            const compressed = compress(JSON.stringify(original));

            assert.deepEqual(this.buildAdapter().decompressPayload(compressed, { 'x-compressed-json': 1 }), original);
        });

        test('an unflagged payload is passed through untouched', function (assert) {
            const payload = { users: [] };

            assert.strictEqual(this.buildAdapter().decompressPayload(payload, {}), payload);
        });

        test('any other flag value leaves the payload alone', function (assert) {
            const payload = { users: [] };

            assert.strictEqual(this.buildAdapter().decompressPayload(payload, { 'x-compressed-json': '0' }), payload);
        });

        test('handleResponse decompresses before deciding whether it is an error', function (assert) {
            const compressed = compress(JSON.stringify({ errors: ['Compressed failure'] }));

            const result = this.buildAdapter().handleResponse(200, { 'x-compressed-json': '1' }, compressed, {});

            assert.true(result instanceof AdapterError, 'the error is only visible after decompression');
            assert.strictEqual(result.message, 'Compressed failure');
        });
    });
});

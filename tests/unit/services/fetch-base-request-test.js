import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * `request()` — the method every verb on this service funnels through, and the
 * one this campaign long recorded as unreachable because it calls the
 * MODULE-SCOPE `fetch` imported from ember-fetch rather than the global.
 *
 * It IS reachable, just not through `window.fetch`. This build does not prefer
 * native fetch, so ember-fetch bundles the github/fetch polyfill and assigns it
 * to its OWN module exports rather than to the global — which is why swapping
 * window.fetch changed nothing and the requests went out for real.
 *
 * The seam is one level in. Under a test environment ember-fetch's default
 * export is a wrapper:
 *
 *   exports['default'] = function () {
 *       pending++;
 *       return exports.fetch.apply(originalGlobal, arguments).then(...);
 *   };
 *
 * `exports.fetch` is read at CALL time, and `exports` is the AMD module object
 * that `window.require('fetch')` returns. Replacing `.fetch` on it therefore
 * intercepts every call the service makes, and is restored afterwards.
 */
module('Unit | Service | fetch (base request)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.fetchModule = window.require('fetch');
        this.originalModuleFetch = this.fetchModule.fetch;
        this.requests = [];
        this.response = { ok: true, status: 200, statusText: 'OK', json: { data: 'ok' } };
        this.networkRejects = false;

        this.fetchModule.fetch = (url, options) => {
            this.requests.push({ url, options });

            if (this.networkRejects) {
                return Promise.reject(new Error('network down'));
            }

            const { ok, status, statusText, json } = this.response;
            return Promise.resolve({
                ok,
                status,
                statusText,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve(json),
                text: () => Promise.resolve(JSON.stringify(json)),
                clone() {
                    return this;
                },
                blob: () => Promise.resolve(new Blob([])),
            });
        };

        // getHeaders runs in the CONSTRUCTOR and reads session.data.authenticated,
        // so a bare service stub throws before any test body runs.
        const testContext = this;
        this.sessionData = { authenticated: {} };
        this.isAuthenticated = false;
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

        this.service = this.owner.lookup('service:fetch');
        this.lastRequest = () => this.requests.at(-1);
    });

    hooks.afterEach(function () {
        if (typeof this.originalModuleFetch === 'function') {
            this.fetchModule.fetch = this.originalModuleFetch;
        }
    });

    module('the url it builds', function () {
        test('host, namespace and path are joined', async function (assert) {
            await this.service.request('orders');

            assert.strictEqual(this.lastRequest().url, [this.service.host, this.service.namespace, 'orders'].filter(Boolean).join('/'));
        });

        test('an external request uses the path verbatim', async function (assert) {
            await this.service.request('https://example.com/thing', 'GET', {}, { externalRequest: true });

            assert.strictEqual(this.lastRequest().url, 'https://example.com/thing');
        });

        test('the host and namespace can be overridden per call', async function (assert) {
            await this.service.request('orders', 'GET', {}, { host: 'https://api.example.com', namespace: 'v2' });

            assert.strictEqual(this.lastRequest().url, 'https://api.example.com/v2/orders');
        });

        test('a blank namespace is dropped rather than leaving a double slash', async function (assert) {
            await this.service.request('orders', 'GET', {}, { host: 'https://api.example.com', namespace: '' });

            assert.strictEqual(this.lastRequest().url, 'https://api.example.com/orders');
        });
    });

    module('the request it sends', function () {
        test('GET is the default method', async function (assert) {
            await this.service.request('orders');

            assert.strictEqual(this.lastRequest().options.method, 'GET');
        });

        test('the method is passed through', async function (assert) {
            await this.service.request('orders', 'POST');

            assert.strictEqual(this.lastRequest().options.method, 'POST');
        });

        test('cors is the default mode and can be overridden', async function (assert) {
            await this.service.request('orders');
            assert.strictEqual(this.lastRequest().options.mode, 'cors');

            await this.service.request('orders', 'GET', {}, { mode: 'no-cors' });
            assert.strictEqual(this.lastRequest().options.mode, 'no-cors');
        });

        test('credentials default to the service setting and can be overridden', async function (assert) {
            await this.service.request('orders');
            assert.strictEqual(this.lastRequest().options.credentials, this.service.credentials);

            await this.service.request('orders', 'GET', {}, { credentials: 'omit' });
            assert.strictEqual(this.lastRequest().options.credentials, 'omit');
        });

        test('extra data is spread into the request', async function (assert) {
            await this.service.request('orders', 'POST', { body: '{"a":1}' });

            assert.strictEqual(this.lastRequest().options.body, '{"a":1}');
        });

        test('caller headers are merged over the service headers', async function (assert) {
            await this.service.request('orders', 'GET', {}, { headers: { 'X-Custom': 'yes' } });

            assert.strictEqual(this.lastRequest().options.headers['X-Custom'], 'yes');
            assert.strictEqual(this.lastRequest().options.headers['Content-Type'], this.service.getHeaders()['Content-Type'], 'and the defaults survive');
        });
    });

    module('a successful response', function () {
        test('it resolves with the decoded json', async function (assert) {
            this.response.json = { id: 'order-1' };

            assert.deepEqual(await this.service.request('orders'), { id: 'order-1' });
        });

        test('an onSuccess callback receives the same payload', async function (assert) {
            const seen = [];
            this.response.json = { id: 'order-1' };

            const result = await this.service.request('orders', 'GET', {}, { onSuccess: (payload) => seen.push(payload) });

            assert.deepEqual(seen, [{ id: 'order-1' }]);
            assert.deepEqual(result, { id: 'order-1' });
        });

        test('a non-function onSuccess is ignored', async function (assert) {
            assert.deepEqual(await this.service.request('orders', 'GET', {}, { onSuccess: 'not a function' }), { data: 'ok' });
        });
    });

    module('a failed response', function (hooks) {
        hooks.beforeEach(function () {
            this.response.ok = false;
            this.response.status = 422;
            this.response.statusText = 'Unprocessable Entity';
        });

        test('an errors array rejects with its first entry', async function (assert) {
            this.response.json = { errors: ['Name is required'] };

            await assert.rejects(this.service.request('orders'), /Name is required/);
        });

        test('an empty errors array falls back to the status text', async function (assert) {
            this.response.json = { errors: [] };

            await assert.rejects(this.service.request('orders'), /Unprocessable Entity/);
        });

        test('a string error rejects with it', async function (assert) {
            this.response.json = { error: 'Something broke' };

            await assert.rejects(this.service.request('orders'), /Something broke/);
        });

        test('an error object is rejected as-is', async function (assert) {
            this.response.json = { error: { code: 'E_BROKE' } };

            try {
                await this.service.request('orders');
                assert.true(false, 'it should have rejected');
            } catch (error) {
                assert.deepEqual(error, { code: 'E_BROKE' });
            }
        });

        test('a message string rejects with it', async function (assert) {
            this.response.json = { message: 'Not allowed' };

            await assert.rejects(this.service.request('orders'), /Not allowed/);
        });

        test('an unrecognised shape is rejected whole', async function (assert) {
            this.response.json = { unexpected: true };

            try {
                await this.service.request('orders');
                assert.true(false, 'it should have rejected');
            } catch (error) {
                assert.deepEqual(error, { unexpected: true });
            }
        });

        test('rawError rejects with the payload instead of an Error', async function (assert) {
            this.response.json = { errors: ['Name is required'] };

            try {
                await this.service.request('orders', 'GET', {}, { rawError: true });
                assert.true(false, 'it should have rejected');
            } catch (error) {
                assert.deepEqual(error, { errors: ['Name is required'] }, 'the caller gets the raw body');
            }
        });

        test('an onError callback receives the payload', async function (assert) {
            const seen = [];
            this.response.json = { message: 'Not allowed' };

            await assert.rejects(this.service.request('orders', 'GET', {}, { onError: (payload) => seen.push(payload) }), /Not allowed/);

            assert.deepEqual(seen, [{ message: 'Not allowed' }]);
        });
    });

    module('a network failure', function () {
        test('it rejects with the underlying error', async function (assert) {
            this.networkRejects = true;

            await assert.rejects(this.service.request('orders'), /network down/);
        });
    });
});

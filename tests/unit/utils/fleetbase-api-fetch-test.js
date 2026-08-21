import fleetbaseApiFetch from 'dummy/utils/fleetbase-api-fetch';
import { module, test } from 'qunit';
import config from 'dummy/config/environment';

const SESSION_KEY = 'ember_simple_auth-session';

module('Unit | Utility | fleetbase-api-fetch', function (hooks) {
    hooks.beforeEach(function () {
        this.calls = [];
        this.originalFetch = window.fetch;
        this.originalConsoleError = console.error;
        // The util logs before rethrowing; silence it so failures stay readable.
        console.error = () => {};

        this.respondWith = ({ ok = true, status = 200, body = { data: 'ok' } } = {}) => {
            window.fetch = (url, options) => {
                this.calls.push({ url, options });
                return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
            };
        };
    });

    hooks.afterEach(function () {
        window.fetch = this.originalFetch;
        console.error = this.originalConsoleError;
        window.localStorage.removeItem(SESSION_KEY);
    });

    test('it builds the url from the configured host and namespace', async function (assert) {
        this.respondWith();

        const result = await fleetbaseApiFetch('GET', 'orders', null);

        assert.deepEqual(result, { data: 'ok' });
        assert.strictEqual(this.calls[0].url, `${config.API.host}/${config.API.namespace}/orders`);
    });

    test('it honours a namespace override', async function (assert) {
        this.respondWith();

        await fleetbaseApiFetch('GET', 'orders', null, { namespace: 'v2' });

        assert.strictEqual(this.calls[0].url, `${config.API.host}/v2/orders`);
    });

    test('it appends query parameters for GET requests', async function (assert) {
        this.respondWith();

        await fleetbaseApiFetch('GET', 'orders', { page: 2, status: 'active' });

        assert.true(this.calls[0].url.endsWith('/orders?page=2&status=active'));
    });

    test('it sends a json body for mutating methods', async function (assert) {
        this.respondWith();

        await fleetbaseApiFetch('POST', 'orders', { name: 'Order' });

        assert.strictEqual(this.calls[0].options.body, JSON.stringify({ name: 'Order' }));
        assert.strictEqual(this.calls[0].options.method, 'POST');
    });

    test('it defaults the request options and omits authorization without a session', async function (assert) {
        this.respondWith();

        await fleetbaseApiFetch('GET', 'orders', null);

        const { headers, mode, cache, redirect, credentials, keepalive } = this.calls[0].options;
        assert.strictEqual(headers['Content-Type'], 'application/json');
        assert.notOk(headers['Authorization'], 'no authorization header without a stored session');
        assert.strictEqual(mode, 'cors');
        assert.strictEqual(cache, 'default');
        assert.strictEqual(redirect, 'follow');
        assert.strictEqual(credentials, 'same-origin');
        assert.false(keepalive);
    });

    test('it attaches the bearer token from the stored session', async function (assert) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: 'abc123' } }));
        this.respondWith();

        await fleetbaseApiFetch('GET', 'orders', null);

        assert.strictEqual(this.calls[0].options.headers['Authorization'], 'Bearer abc123');
    });

    test('it ignores a stored session without an authenticated section', async function (assert) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ other: true }));
        this.respondWith();

        await fleetbaseApiFetch('GET', 'orders', null);

        assert.notOk(this.calls[0].options.headers['Authorization']);
    });

    test('it overrides individual fetch options', async function (assert) {
        this.respondWith();

        await fleetbaseApiFetch('GET', 'orders', null, { mode: 'no-cors', credentials: 'include', keepalive: true });

        const { mode, credentials, keepalive } = this.calls[0].options;
        assert.strictEqual(mode, 'no-cors');
        assert.strictEqual(credentials, 'include');
        assert.true(keepalive);
    });

    test('it throws on a non-2xx response', async function (assert) {
        this.respondWith({ ok: false, status: 503 });

        await assert.rejects(fleetbaseApiFetch('GET', 'orders', null), /status: 503/);
    });

    test('it returns the fallback response instead of throwing when one is supplied', async function (assert) {
        this.respondWith({ ok: false, status: 500 });

        const result = await fleetbaseApiFetch('GET', 'orders', null, { fallbackResponse: [] });

        assert.deepEqual(result, [], 'the fallback is returned');
    });

    test('it returns the fallback response for a network failure', async function (assert) {
        window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

        const result = await fleetbaseApiFetch('GET', 'orders', null, { fallbackResponse: null });

        assert.strictEqual(result, null);
    });

    test('it rethrows a network failure without a fallback', async function (assert) {
        window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

        await assert.rejects(fleetbaseApiFetch('GET', 'orders', null), /Failed to fetch/);
    });

    test('params and fetch options both default when omitted', async function (assert) {
        this.respondWith({ body: { data: 'ok' } });

        const result = await fleetbaseApiFetch('GET', 'orders');

        assert.deepEqual(result, { data: 'ok' });
        const { url, options } = this.calls[0];
        assert.true(url.includes(`/${config.API.namespace}/orders?`), 'the namespace falls back to config and the empty params still build a query string');
        assert.strictEqual(options.mode, 'cors', 'and the safe defaults are applied');
    });
});

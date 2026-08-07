import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';
import { compress } from 'compress-json';

/**
 * The verb helpers all funnel into `request`, so their contract is the
 * arguments they hand it — path, method, fetch options — which a stubbed
 * `request` captures without any network involvement.
 *
 * `parseJSON` and the two response helpers take a Response directly, so they
 * are driven with fixtures rather than stubs.
 */
class OrderConfigModel extends Model {
    @attr('string') name;
}

function response({ headers = {}, json = {}, text, status = 200, statusText = 'OK', ok = true } = {}) {
    return {
        status,
        statusText,
        ok,
        headers: { get: (key) => headers[key] ?? null },
        json: () => Promise.resolve(json),
        text: () => Promise.resolve(text),
    };
}

module('Unit | Service | fetch (request shaping)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        const testContext = this;

        this.owner.register(
            'service:session',
            class extends Service {
                data = { authenticated: {} };
                isAuthenticated = false;
            }
        );

        this.owner.register('model:order-config', OrderConfigModel);

        this.service = this.owner.lookup('service:fetch');
        this.store = this.owner.lookup('service:store');

        this.requests = [];
        this.requestResponse = undefined;
        this.service.request = (...args) => {
            testContext.requests.push(args);
            return Promise.resolve(testContext.requestResponse);
        };
        this.lastRequest = () => this.requests.at(-1);
    });

    hooks.afterEach(function () {
        this.service.localCache.clear();
    });

    module('verb helpers', function () {
        test('get builds a query string onto the path', async function (assert) {
            await this.service.get('orders', { status: 'active', limit: 5 });

            const [path, method] = this.lastRequest();
            assert.strictEqual(path, 'orders?status=active&limit=5');
            assert.strictEqual(method, 'GET');
        });

        test('get with no query leaves the path alone', async function (assert) {
            await this.service.get('orders');

            assert.strictEqual(this.lastRequest()[0], 'orders');
        });

        test('get passes no body', async function (assert) {
            await this.service.get('orders');

            assert.deepEqual(this.lastRequest()[2], {});
        });

        test('post sends a JSON body', async function (assert) {
            await this.service.post('orders', { name: 'Order A' });

            const [path, method, data] = this.lastRequest();
            assert.strictEqual(path, 'orders');
            assert.strictEqual(method, 'POST');
            assert.deepEqual(JSON.parse(data.body), { name: 'Order A' });
        });

        test('put, patch and delete each send their own method with a JSON body', async function (assert) {
            await this.service.put('orders/1', { name: 'Renamed' });
            assert.strictEqual(this.lastRequest()[1], 'PUT');
            assert.deepEqual(JSON.parse(this.lastRequest()[2].body), { name: 'Renamed' });

            await this.service.patch('orders/1', { name: 'Patched' });
            assert.strictEqual(this.lastRequest()[1], 'PATCH');

            await this.service.delete('orders/1', { force: true });
            assert.strictEqual(this.lastRequest()[1], 'DELETE');
            assert.deepEqual(JSON.parse(this.lastRequest()[2].body), { force: true });
        });

        test('the verbs default to an empty body', async function (assert) {
            await this.service.post('orders');

            assert.deepEqual(JSON.parse(this.lastRequest()[2].body), {});
        });

        test('options are passed through untouched', async function (assert) {
            const options = { normalizeToEmberData: true, headers: { 'X-A': '1' } };

            await this.service.post('orders', {}, options);

            assert.strictEqual(this.lastRequest()[3], options);
        });

        test('upload posts each file under the same form field', async function (assert) {
            const first = new Blob(['a'], { type: 'text/plain' });
            const second = new Blob(['b'], { type: 'text/plain' });

            await this.service.upload('files', [first, second]);

            const [path, method, data] = this.lastRequest();
            assert.strictEqual(path, 'files');
            assert.strictEqual(method, 'POST');
            assert.true(data.body instanceof FormData);
            assert.strictEqual(data.body.getAll('file').length, 2);
        });

        test('upload with no files still sends a form body', async function (assert) {
            await this.service.upload('files');

            assert.strictEqual(this.lastRequest()[2].body.getAll('file').length, 0);
        });
    });

    module('cachedGet', function () {
        test('get delegates when fromCache is set', async function (assert) {
            const calls = [];
            this.service.cachedGet = (...args) => {
                calls.push(args);
                return Promise.resolve('cached');
            };

            const result = await this.service.get('orders', { a: 1 }, { fromCache: true });

            assert.strictEqual(result, 'cached');
            assert.deepEqual(calls[0][0], 'orders');
            assert.deepEqual(calls[0][1], { a: 1 });
        });

        test('a cache miss requests and stores the response', async function (assert) {
            this.requestResponse = { orders: [1, 2] };

            const result = await this.service.cachedGet('orders');

            assert.deepEqual(result, { orders: [1, 2] });
            assert.deepEqual(this.service.localCache.get('orders'), { orders: [1, 2] }, 'the response is cached under the dasherized path');
            assert.ok(this.service.localCache.get('orders-version'), 'with a version stamp');
        });

        test('the cache key is dasherized', async function (assert) {
            this.requestResponse = { ok: true };

            await this.service.cachedGet('fleet-ops/orderConfigs');

            assert.ok(this.service.localCache.get('fleet-ops/order-configs'));
        });

        test('a cache hit is served without requesting', async function (assert) {
            this.service.localCache.set('orders', { fromCache: true });
            this.service.localCache.set('orders-version', new Date().toISOString());

            const result = await this.service.cachedGet('orders');

            assert.deepEqual(result, { fromCache: true });
            assert.deepEqual(this.requests, [], 'no request was made');
        });

        test('an expired entry is flushed and refetched', async function (assert) {
            const old = new Date();
            old.setDate(old.getDate() - 30);
            this.service.localCache.set('orders', { stale: true });
            this.service.localCache.set('orders-version', old.toISOString());
            this.requestResponse = { fresh: true };

            const result = await this.service.cachedGet('orders');

            assert.deepEqual(result, { fresh: true });
            assert.strictEqual(this.requests.length, 1);
        });

        test('the expiry window is configurable', async function (assert) {
            const old = new Date();
            old.setDate(old.getDate() - 5);
            this.service.localCache.set('orders', { stale: true });
            this.service.localCache.set('orders-version', old.toISOString());

            const kept = await this.service.cachedGet('orders', {}, { expirationInterval: 30 });

            assert.deepEqual(kept, { stale: true }, 'five days is inside a thirty-day window');
            assert.deepEqual(this.requests, []);
        });

        test('clearData forces a refetch', async function (assert) {
            this.service.localCache.set('orders', { stale: true });
            this.service.localCache.set('orders-version', new Date().toISOString());
            this.requestResponse = { fresh: true };

            const result = await this.service.cachedGet('orders', {}, { clearData: true });

            assert.deepEqual(result, { fresh: true });
        });

        test('a cached payload can be normalized on the way out', async function (assert) {
            this.service.localCache.set('orders', { 'order-config': [{ uuid: '1', name: 'A' }] });
            this.service.localCache.set('orders-version', new Date().toISOString());

            const records = await this.service.cachedGet('orders', {}, { normalizeToEmberData: true, normalizeModelType: 'order-config' });

            assert.deepEqual(
                records.map((r) => r.name),
                ['A']
            );
        });
    });

    module('cache maintenance', function () {
        test('flushing clears both the entry and its version', function (assert) {
            this.service.localCache.set('orders', { a: 1 });
            this.service.localCache.set('orders-version', 'v1');

            this.service.flushRequestCache('orders');

            assert.strictEqual(this.service.localCache.get('orders'), undefined);
            assert.strictEqual(this.service.localCache.get('orders-version'), undefined);
        });

        test('flushing dasherizes the path', function (assert) {
            this.service.localCache.set('order-configs', { a: 1 });

            this.service.flushRequestCache('orderConfigs');

            assert.strictEqual(this.service.localCache.get('order-configs'), undefined);
        });

        test('a version mismatch clears the whole cache', function (assert) {
            this.service.localCache.set('orders', { a: 1 });
            this.service.localCache.set('console-version', 'ancient');

            this.service.shouldResetCache();

            assert.strictEqual(this.service.localCache.get('orders'), undefined);
            assert.notStrictEqual(this.service.localCache.get('console-version'), 'ancient', 'and records the current version');
        });

        test('a matching version leaves the cache alone', function (assert) {
            this.service.localCache.set('console-version', 'v1.2.3');
            this.service.localCache.set('orders', { a: 1 });
            const config = this.owner.resolveRegistration('config:environment');
            const original = config.APP.version;
            config.APP.version = 'v1.2.3';

            try {
                this.service.shouldResetCache();
            } finally {
                config.APP.version = original;
            }

            assert.deepEqual(this.service.localCache.get('orders'), { a: 1 });
            assert.strictEqual(this.service.localCache.get('console-version'), 'v1.2.3');
        });

        test('with no APP.version configured the cache is cleared on every call', function (assert) {
            // Pinned, not fixed. `shouldResetCache` clears whenever the stored
            // version is falsy OR differs from config.APP.version. When an app
            // does not set APP.version — as the dummy app does not — the stored
            // value is written as undefined, so the falsy branch trips again on
            // the very next call and the request cache can never survive.
            const config = this.owner.resolveRegistration('config:environment');
            assert.strictEqual(config.APP.version, undefined, 'the dummy app sets none');

            this.service.shouldResetCache();
            this.service.localCache.set('orders', { a: 1 });
            this.service.shouldResetCache();

            assert.strictEqual(this.service.localCache.get('orders'), undefined, 'cleared again');
        });
    });

    module('parseJSON', function () {
        test('it reports the status alongside the body', async function (assert) {
            const parsed = await this.service.parseJSON(response({ json: { ok: 1 }, status: 201, statusText: 'Created' }));

            assert.deepEqual(parsed, { statusText: 'Created', status: 201, ok: true, json: { ok: 1 } });
        });

        test('a compressed body is decompressed', async function (assert) {
            const original = { orders: [{ id: '1' }] };
            const text = JSON.stringify(compress(JSON.stringify(original)));

            const parsed = await this.service.parseJSON(response({ headers: { 'x-compressed-json': '1' }, text }));

            assert.deepEqual(parsed.json, original);
        });

        test('only the exact flag triggers decompression', async function (assert) {
            const parsed = await this.service.parseJSON(response({ headers: { 'x-compressed-json': '0' }, json: { plain: true } }));

            assert.deepEqual(parsed.json, { plain: true });
        });

        test('a failure is rewrapped with context', async function (assert) {
            const broken = response();
            broken.json = () => Promise.reject(new Error('bad json'));

            await assert.rejects(this.service.parseJSON(broken), /Error processing response: bad json/);
        });

        test('a non-ok response is still parsed rather than thrown', async function (assert) {
            const parsed = await this.service.parseJSON(response({ status: 422, statusText: 'Unprocessable', ok: false, json: { errors: ['Nope'] } }));

            assert.false(parsed.ok);
            assert.deepEqual(parsed.json.errors, ['Nope']);
        });
    });

    module('response helpers', function () {
        test('the filename comes from the content disposition', function (assert) {
            const res = response({ headers: { 'content-disposition': 'attachment; filename=report.csv' } });

            assert.strictEqual(this.service.getFilenameFromResponse(res), 'report.csv');
        });

        test('surrounding quotes are stripped', function (assert) {
            const res = response({ headers: { 'content-disposition': 'attachment; filename="my report.csv"' } });

            assert.strictEqual(this.service.getFilenameFromResponse(res), 'my report.csv');
        });

        test('without a disposition the default is used', function (assert) {
            assert.strictEqual(this.service.getFilenameFromResponse(response(), 'fallback.csv'), 'fallback.csv');
            assert.strictEqual(this.service.getFilenameFromResponse(response()), null);
        });

        test('the mime type is taken up to the first semicolon', function (assert) {
            const res = response({ headers: { 'content-type': 'text/csv; charset=utf-8' } });

            assert.strictEqual(this.service.getMimeTypeFromResponse(res), 'text/csv');
        });

        test('a content type without parameters yields the default', function (assert) {
            const res = response({ headers: { 'content-type': 'text/csv' } });

            assert.strictEqual(this.service.getMimeTypeFromResponse(res, 'application/octet-stream'), 'application/octet-stream', 'the pattern requires a semicolon');
        });

        test('without a content type the default is used', function (assert) {
            assert.strictEqual(this.service.getMimeTypeFromResponse(response(), 'text/plain'), 'text/plain');
            assert.strictEqual(this.service.getMimeTypeFromResponse(response()), null);
        });
    });
});

import loadExtensions, { clearExtensionsCache } from 'dummy/utils/load-extensions';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

const CACHE_KEY = 'fleetbase_extensions_list';
const CACHE_VERSION_KEY = 'fleetbase_extensions_version';

/**
 * loadExtensions fetches /extensions.json, caching the result in localStorage
 * for an hour — but only *reads* that cache in production, so development and
 * test builds always go to the server.
 */
module('Unit | Utility | load-extensions', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.originalFetch = window.fetch;
        this.requested = [];
        this.extensions = [{ name: '@fleetbase/fleetops-engine' }];
        const testContext = this;

        window.fetch = (url, options) => {
            testContext.requested.push({ url, options });
            if (testContext.fetchRejects) {
                return Promise.reject(new Error('offline'));
            }
            return Promise.resolve({ json: () => Promise.resolve(testContext.extensions) });
        };

        this.config = this.owner.resolveRegistration('config:environment');
        this.originalEnvironment = this.config.environment;
        this.originalVersion = this.config.APP.version;

        clearExtensionsCache();
    });

    hooks.afterEach(function () {
        window.fetch = this.originalFetch;
        this.config.environment = this.originalEnvironment;
        this.config.APP.version = this.originalVersion;
        clearExtensionsCache();
    });

    module('fetching', function () {
        test('it fetches the extensions manifest', async function (assert) {
            const extensions = await loadExtensions();

            assert.deepEqual(extensions, this.extensions);
            assert.strictEqual(this.requested[0].url, '/extensions.json');
            assert.strictEqual(this.requested[0].options.cache, 'default', 'the browser cache is allowed to serve it');
        });

        test('a failed fetch rejects', async function (assert) {
            this.fetchRejects = true;

            await assert.rejects(loadExtensions(), /offline/);
        });

        test('the result is written to the cache', async function (assert) {
            this.config.APP.version = 'v1.2.3';

            await loadExtensions();

            const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY));
            assert.deepEqual(cached.extensions, this.extensions);
            assert.ok(cached.timestamp, 'stamped with a time');
            assert.strictEqual(window.localStorage.getItem(CACHE_VERSION_KEY), 'v1.2.3');
        });
    });

    module('the cache is only read in production', function () {
        test('outside production a fresh cache entry is ignored', async function (assert) {
            this.config.environment = 'development';
            this.config.APP.version = 'v1.2.3';
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ extensions: [{ name: 'cached' }], timestamp: Date.now() }));
            window.localStorage.setItem(CACHE_VERSION_KEY, 'v1.2.3');

            const extensions = await loadExtensions();

            assert.deepEqual(extensions, this.extensions, 'the server answer is used');
            assert.strictEqual(this.requested.length, 1);
        });

        test('in production a fresh cache entry is served without fetching', async function (assert) {
            this.config.environment = 'production';
            this.config.APP.version = 'v1.2.3';
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ extensions: [{ name: 'cached' }], timestamp: Date.now() }));
            window.localStorage.setItem(CACHE_VERSION_KEY, 'v1.2.3');

            const extensions = await loadExtensions();

            assert.deepEqual(extensions, [{ name: 'cached' }]);
            assert.deepEqual(this.requested, [], 'nothing was fetched');
        });

        test('in production an entry from another app version is discarded', async function (assert) {
            this.config.environment = 'production';
            this.config.APP.version = 'v2.0.0';
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ extensions: [{ name: 'cached' }], timestamp: Date.now() }));
            window.localStorage.setItem(CACHE_VERSION_KEY, 'v1.2.3');

            const extensions = await loadExtensions();

            assert.deepEqual(extensions, this.extensions, 'a deploy invalidates the cache');
        });

        test('in production an entry older than an hour is discarded', async function (assert) {
            this.config.environment = 'production';
            this.config.APP.version = 'v1.2.3';
            const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ extensions: [{ name: 'cached' }], timestamp: twoHoursAgo }));
            window.localStorage.setItem(CACHE_VERSION_KEY, 'v1.2.3');

            const extensions = await loadExtensions();

            assert.deepEqual(extensions, this.extensions);
        });

        test('in production a corrupt entry is survivable', async function (assert) {
            this.config.environment = 'production';
            this.config.APP.version = 'v1.2.3';
            window.localStorage.setItem(CACHE_KEY, 'not json');
            window.localStorage.setItem(CACHE_VERSION_KEY, 'v1.2.3');

            const extensions = await loadExtensions();

            assert.deepEqual(extensions, this.extensions);
        });

        test('in production a half-written cache is ignored', async function (assert) {
            this.config.environment = 'production';
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ extensions: [{ name: 'cached' }], timestamp: Date.now() }));
            window.localStorage.removeItem(CACHE_VERSION_KEY);

            const extensions = await loadExtensions();

            assert.deepEqual(extensions, this.extensions, 'both keys are required');
        });
    });

    module('clearExtensionsCache', function () {
        test('it removes both keys', function (assert) {
            window.localStorage.setItem(CACHE_KEY, 'anything');
            window.localStorage.setItem(CACHE_VERSION_KEY, 'v1');

            clearExtensionsCache();

            assert.strictEqual(window.localStorage.getItem(CACHE_KEY), null);
            assert.strictEqual(window.localStorage.getItem(CACHE_VERSION_KEY), null);
        });

        test('clearing an empty cache is harmless', function (assert) {
            clearExtensionsCache();
            clearExtensionsCache();

            assert.strictEqual(window.localStorage.getItem(CACHE_KEY), null);
        });
    });
});

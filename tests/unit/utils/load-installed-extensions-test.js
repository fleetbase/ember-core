import loadInstalledExtensions from 'dummy/utils/load-installed-extensions';
import { module, test } from 'qunit';
import { clearExtensionsCache } from 'dummy/utils/load-extensions';

const SESSION_KEY = 'ember_simple_auth-session';

/**
 * Narrows the full extensions manifest down to what this console may actually
 * mount: a hard-coded set of core engines, plus whatever the registry reports
 * as installed for the authenticated user.
 *
 * Every dependency reaches the outside world through a global — `fetch` for
 * both the manifest and the registry, `localStorage` for the session — so all
 * three are swapped here and restored afterwards. The stub dispatches on URL
 * because the two requests go to different places.
 */
module('Unit | Utility | load-installed-extensions', function (hooks) {
    hooks.beforeEach(function () {
        this.originalFetch = window.fetch;
        this.requested = [];
        this.manifest = [];
        this.registryEngines = [];
        this.registryFails = false;
        const testContext = this;

        window.fetch = (url) => {
            testContext.requested.push(url);

            if (String(url).includes('extensions.json')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(testContext.manifest) });
            }

            if (testContext.registryFails) {
                return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
            }

            return Promise.resolve({ ok: true, json: () => Promise.resolve(testContext.registryEngines) });
        };

        window.localStorage.removeItem(SESSION_KEY);
        clearExtensionsCache();

        this.authenticate = () => window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: 'abc123' } }));
    });

    hooks.afterEach(function () {
        window.fetch = this.originalFetch;
        window.localStorage.removeItem(SESSION_KEY);
        clearExtensionsCache();
    });

    module('while unauthenticated', function () {
        test('the registry is never asked', async function (assert) {
            this.manifest = [{ name: '@fleetbase/fleetops-engine' }];

            await loadInstalledExtensions();

            assert.strictEqual(this.requested.length, 1, 'only the manifest is fetched');
            assert.true(this.requested[0].includes('extensions.json'));
        });

        test('only core engines survive', async function (assert) {
            this.manifest = [{ name: '@fleetbase/fleetops-engine' }, { name: '@acme/custom-engine' }];

            const installed = await loadInstalledExtensions();

            assert.deepEqual(
                installed.map((pkg) => pkg.name),
                ['@fleetbase/fleetops-engine'],
                'a third-party engine needs the registry to vouch for it'
            );
        });

        test('a malformed session counts as unauthenticated', async function (assert) {
            window.localStorage.setItem(SESSION_KEY, 'not json');
            this.manifest = [{ name: '@acme/custom-engine' }];

            const installed = await loadInstalledExtensions();

            assert.deepEqual(installed, []);
        });

        test('a session with no token counts as unauthenticated', async function (assert) {
            window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: {} }));
            this.manifest = [{ name: '@acme/custom-engine' }];

            assert.deepEqual(await loadInstalledExtensions(), []);
        });
    });

    module('while authenticated', function () {
        test('the registry is consulted', async function (assert) {
            this.authenticate();
            this.manifest = [{ name: '@fleetbase/fleetops-engine' }];

            await loadInstalledExtensions();

            assert.strictEqual(this.requested.length, 2);
            assert.true(this.requested[1].includes('engines'), 'the registry endpoint is asked for engines');
        });

        test('an engine the registry reports is kept', async function (assert) {
            this.authenticate();
            this.manifest = [{ name: '@acme/custom-engine' }];
            this.registryEngines = [{ name: '@acme/custom-engine' }];

            const installed = await loadInstalledExtensions();

            assert.deepEqual(
                installed.map((pkg) => pkg.name),
                ['@acme/custom-engine']
            );
        });

        test('an engine the registry does not report is dropped', async function (assert) {
            this.authenticate();
            this.manifest = [{ name: '@acme/custom-engine' }, { name: '@acme/other-engine' }];
            this.registryEngines = [{ name: '@acme/custom-engine' }];

            const installed = await loadInstalledExtensions();

            assert.deepEqual(
                installed.map((pkg) => pkg.name),
                ['@acme/custom-engine']
            );
        });

        test('core engines are kept regardless of the registry', async function (assert) {
            this.authenticate();
            this.manifest = [{ name: '@fleetbase/storefront-engine' }];
            this.registryEngines = [];

            const installed = await loadInstalledExtensions();

            assert.deepEqual(
                installed.map((pkg) => pkg.name),
                ['@fleetbase/storefront-engine']
            );
        });

        test('a failing registry falls back to an empty list rather than throwing', async function (assert) {
            this.authenticate();
            this.registryFails = true;
            this.manifest = [{ name: '@fleetbase/fleetops-engine' }, { name: '@acme/custom-engine' }];

            const installed = await loadInstalledExtensions();

            assert.deepEqual(
                installed.map((pkg) => pkg.name),
                ['@fleetbase/fleetops-engine'],
                'core engines still mount when the registry is unreachable'
            );
        });
    });

    module('the core engine list', function () {
        test('every shipped engine is treated as core', async function (assert) {
            const core = [
                '@fleetbase/fleetops-engine',
                '@fleetbase/storefront-engine',
                '@fleetbase/registry-bridge-engine',
                '@fleetbase/dev-engine',
                '@fleetbase/iam-engine',
                '@fleetbase/ledger-engine',
                '@fleetbase/pallet-engine',
                '@fleetbase/ai-engine',
                '@fleetbase/customer-portal-engine',
                '@fleetbase/vroom-engine',
                '@fleetbase/valhalla-engine',
            ];
            this.manifest = core.map((name) => ({ name }));

            const installed = await loadInstalledExtensions();

            assert.deepEqual(
                installed.map((pkg) => pkg.name),
                core
            );
        });

        test('extra core engines can be supplied by the caller', async function (assert) {
            this.manifest = [{ name: '@acme/custom-engine' }];

            const installed = await loadInstalledExtensions(['@acme/custom-engine']);

            assert.deepEqual(
                installed.map((pkg) => pkg.name),
                ['@acme/custom-engine'],
                'without needing the registry'
            );
        });

        test('an empty manifest yields nothing', async function (assert) {
            assert.deepEqual(await loadInstalledExtensions(), []);
        });
    });
});

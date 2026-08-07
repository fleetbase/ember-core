import loadEngines from 'dummy/utils/load-engines';
import { module, test } from 'qunit';
import hostServices from '@fleetbase/ember-core/exports/host-services';

/**
 * loadEngines turns the extensions manifest into the engine dependency map
 * ember-engines expects: every engine gets the same service list and the same
 * external-route table, with one route entry per installed extension.
 */
module('Unit | Utility | load-engines', function (hooks) {
    hooks.beforeEach(function () {
        this.originalFetch = window.fetch;
        this.requested = [];
        this.extensions = [];
        const testContext = this;

        window.fetch = (url, options) => {
            testContext.requested.push({ url, options });
            if (testContext.fetchRejects) {
                return Promise.reject(new Error('offline'));
            }
            return Promise.resolve({ json: () => Promise.resolve(testContext.extensions) });
        };
    });

    hooks.afterEach(function () {
        window.fetch = this.originalFetch;
    });

    test('it reads the extensions manifest', async function (assert) {
        await loadEngines();

        assert.strictEqual(this.requested[0].url, 'extensions.json');
        assert.strictEqual(this.requested[0].options.cache, 'default');
    });

    test('an empty manifest yields no engines', async function (assert) {
        assert.deepEqual(await loadEngines(), {});
    });

    test('each extension becomes an engine keyed by package name', async function (assert) {
        this.extensions = [
            { name: '@fleetbase/fleetops-engine', extension: 'fleetOps' },
            { name: '@fleetbase/storefront-engine', extension: 'storefront' },
        ];

        const engines = await loadEngines();

        assert.deepEqual(Object.keys(engines), ['@fleetbase/fleetops-engine', '@fleetbase/storefront-engine']);
    });

    test('every engine gets the host services', async function (assert) {
        this.extensions = [{ name: '@fleetbase/fleetops-engine', extension: 'fleetOps' }];

        const engines = await loadEngines();

        assert.deepEqual(engines['@fleetbase/fleetops-engine'].dependencies.services, [...hostServices]);
    });

    test('extra services are appended to the host list', async function (assert) {
        this.extensions = [{ name: '@fleetbase/fleetops-engine', extension: 'fleetOps' }];

        const engines = await loadEngines(null, ['my-service']);

        assert.deepEqual(engines['@fleetbase/fleetops-engine'].dependencies.services, [...hostServices, 'my-service']);
    });

    test('each extension contributes a dasherized external route', async function (assert) {
        this.extensions = [
            { name: '@fleetbase/fleetops-engine', extension: 'fleetOps' },
            { name: '@fleetbase/storefront-engine', extension: 'storefront' },
        ];

        const { externalRoutes } = (await loadEngines())['@fleetbase/fleetops-engine'].dependencies;

        assert.strictEqual(externalRoutes.console, 'console.home');
        assert.strictEqual(externalRoutes.extensions, 'console.extensions');
        assert.strictEqual(externalRoutes['fleet-ops'], 'console.fleet-ops', 'camelCase is dasherized');
        assert.strictEqual(externalRoutes.storefront, 'console.storefront');
    });

    test('every engine shares the same route table', async function (assert) {
        this.extensions = [
            { name: '@fleetbase/fleetops-engine', extension: 'fleetOps' },
            { name: '@fleetbase/storefront-engine', extension: 'storefront' },
        ];

        const engines = await loadEngines();

        assert.deepEqual(
            engines['@fleetbase/storefront-engine'].dependencies.externalRoutes,
            engines['@fleetbase/fleetops-engine'].dependencies.externalRoutes,
            'so an engine can link to any other'
        );
    });

    test('a failed fetch rejects', async function (assert) {
        this.fetchRejects = true;

        await assert.rejects(loadEngines(), /offline/);
    });
});

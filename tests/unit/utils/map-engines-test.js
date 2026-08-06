import mapEngines, { getExtensionMountPath, routeNameFromExtension } from '@fleetbase/ember-core/utils/map-engines';
import { module, test } from 'qunit';
import hostServices from '@fleetbase/ember-core/exports/host-services';

module('Unit | Utility | map-engines', function () {
    module('getExtensionMountPath', function () {
        test('it uses the package name from a scoped extension', function (assert) {
            assert.strictEqual(getExtensionMountPath('@fleetbase/fleetops-engine'), 'fleetops');
            assert.strictEqual(getExtensionMountPath('@fleetbase/storefront'), 'storefront');
        });

        test('it falls back to the whole name when unscoped', function (assert) {
            assert.strictEqual(getExtensionMountPath('dev-engine'), 'dev');
            assert.strictEqual(getExtensionMountPath('standalone'), 'standalone');
        });
    });

    module('routeNameFromExtension', function () {
        test('it dasherizes the mount path by default', function (assert) {
            assert.strictEqual(routeNameFromExtension({ name: '@fleetbase/fleetOps-engine' }), 'fleet-ops');
        });

        test('it prefers an explicit fleetbase route', function (assert) {
            assert.strictEqual(routeNameFromExtension({ name: '@fleetbase/storefront', fleetbase: { route: 'shop' } }), 'shop');
        });

        test('it ignores a fleetbase section without a route', function (assert) {
            assert.strictEqual(routeNameFromExtension({ name: '@fleetbase/storefront', fleetbase: {} }), 'storefront');
        });
    });

    module('mapEngines', function () {
        test('it builds an engine entry per extension', function (assert) {
            const engines = mapEngines([{ name: '@fleetbase/fleetops-engine' }, { name: '@fleetbase/storefront' }]);

            assert.deepEqual(Object.keys(engines), ['@fleetbase/fleetops-engine', '@fleetbase/storefront']);
            assert.deepEqual(engines['@fleetbase/storefront'].dependencies.services, hostServices, 'host services are injected by default');
        });

        test('it exposes the console external routes plus one per extension', function (assert) {
            const engines = mapEngines([{ name: '@fleetbase/fleetops-engine' }]);
            const { externalRoutes } = engines['@fleetbase/fleetops-engine'].dependencies;

            assert.strictEqual(externalRoutes.console, 'console.home');
            assert.strictEqual(externalRoutes.extensions, 'console.extensions');
            assert.strictEqual(externalRoutes.notifications, 'console.notifications');
            assert.strictEqual(externalRoutes.fleetops, 'console.fleetops');
        });

        test('every engine shares the same external route map', function (assert) {
            const engines = mapEngines([{ name: '@fleetbase/a-engine' }, { name: '@fleetbase/b-engine' }]);

            assert.strictEqual(engines['@fleetbase/a-engine'].dependencies.externalRoutes.b, 'console.b', 'routes from later extensions are visible to earlier ones');
        });

        test('it appends additional services', function (assert) {
            const engines = mapEngines([{ name: '@fleetbase/a-engine' }], ['custom-service']);

            const { services } = engines['@fleetbase/a-engine'].dependencies;
            assert.strictEqual(services[services.length - 1], 'custom-service');
        });

        test('it returns an empty map for no extensions', function (assert) {
            assert.deepEqual(mapEngines([]), {});
        });
    });
});

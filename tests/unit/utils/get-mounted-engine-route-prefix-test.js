import getMountedEngineRoutePrefix from 'dummy/utils/get-mounted-engine-route-prefix';
import { module, test } from 'qunit';

/**
 * Builds the route prefix an engine is mounted under, letting an engine's
 * `fleetbase` config override the name it was registered with. The trailing dot
 * is part of the contract — callers concatenate a route name straight onto it.
 */
module('Unit | Utility | get-mounted-engine-route-prefix', function () {
    test('it namespaces the default name under console', function (assert) {
        assert.strictEqual(getMountedEngineRoutePrefix('fleet-ops'), 'console.fleet-ops.');
    });

    test('a fleetbase route config overrides the default', function (assert) {
        assert.strictEqual(getMountedEngineRoutePrefix('fleet-ops', { route: 'operations' }), 'console.operations.');
    });

    test('a non-string route is ignored', function (assert) {
        assert.strictEqual(getMountedEngineRoutePrefix('fleet-ops', { route: 42 }), 'console.fleet-ops.');
        assert.strictEqual(getMountedEngineRoutePrefix('fleet-ops', { route: null }), 'console.fleet-ops.');
    });

    test('an empty config falls back to the default', function (assert) {
        assert.strictEqual(getMountedEngineRoutePrefix('fleet-ops', {}), 'console.fleet-ops.');
    });

    test('a null config falls back to the default', function (assert) {
        assert.strictEqual(getMountedEngineRoutePrefix('fleet-ops', null), 'console.fleet-ops.');
    });

    test('the config argument is optional', function (assert) {
        assert.strictEqual(getMountedEngineRoutePrefix('storefront'), 'console.storefront.');
    });

    test('an empty route string is used as-is', function (assert) {
        assert.strictEqual(getMountedEngineRoutePrefix('fleet-ops', { route: '' }), 'console..', 'an empty string is still a string, so it wins');
    });
});

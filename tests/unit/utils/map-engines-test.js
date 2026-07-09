import mapEngines from 'dummy/utils/map-engines';
import { module, test } from 'qunit';

module('Unit | Utility | map-engines', function () {
    test('it maps engine extensions and skips plugin manifests', function (assert) {
        const result = mapEngines([
            {
                name: '@fleetbase/fleetops-engine',
                fleetbase: {
                    route: 'fleet-ops',
                },
            },
            {
                name: '@fleetbase/partner-plugin',
                type: 'plugin',
                main: 'fleetbase.plugin.js',
            },
        ]);

        assert.ok(result['@fleetbase/fleetops-engine']);
        assert.notOk(result['@fleetbase/partner-plugin']);
        assert.strictEqual(result['@fleetbase/fleetops-engine'].dependencies.externalRoutes['fleet-ops'], 'console.fleet-ops');
    });
});

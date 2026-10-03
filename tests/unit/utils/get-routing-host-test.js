import getRoutingHost, { isRoutingInCountry } from '@fleetbase/ember-core/utils/get-routing-host';
import { module, test } from 'qunit';
import config from 'dummy/config/environment';

function place(country) {
    return { place: { country } };
}

module('Unit | Utility | get-routing-host', function () {
    module('isRoutingInCountry', function () {
        test('it matches the pickup country', function (assert) {
            assert.true(isRoutingInCountry('US', { pickup: { country: 'US' } }));
        });

        test('it matches the dropoff country', function (assert) {
            assert.true(isRoutingInCountry('CA', { dropoff: { country: 'CA' } }));
        });

        test('it matches the first waypoint country', function (assert) {
            assert.true(isRoutingInCountry('US', {}, [place('US')]));
        });

        test('it is false when nothing matches', function (assert) {
            assert.false(isRoutingInCountry('US', { pickup: { country: 'DE' } }));
            assert.false(isRoutingInCountry('US', {}, []));
            assert.false(isRoutingInCountry('US'));
        });

        test('it tolerates a blank payload', function (assert) {
            assert.false(isRoutingInCountry('US', null));
        });
    });

    module('getRoutingHost', function () {
        test('it uses the canadian server when routing in Canada', function (assert) {
            assert.strictEqual(getRoutingHost({ pickup: { country: 'CA' } }), config.osrm.servers.ca);
        });

        test('it uses the american server when routing in the USA', function (assert) {
            assert.strictEqual(getRoutingHost({ pickup: { country: 'US' } }), config.osrm.servers.us);
        });

        test('it falls back to the default host elsewhere', function (assert) {
            assert.strictEqual(getRoutingHost({ pickup: { country: 'DE' } }), config.osrm.host);
            assert.strictEqual(getRoutingHost(), config.osrm.host);
        });

        test('it resolves the host from the first waypoint', function (assert) {
            assert.strictEqual(getRoutingHost({}, [place('CA')]), config.osrm.servers.ca);
        });
    });
});

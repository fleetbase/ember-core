import haversine from 'dummy/utils/haversine';
import { module, test } from 'qunit';

const BERLIN = { latitude: 52.52, longitude: 13.405 };
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

function approx(assert, actual, expected, tolerance, message) {
    assert.true(Math.abs(actual - expected) <= tolerance, `${message} (actual ${actual})`);
}

module('Unit | Utility | haversine', function () {
    test('it computes distance in kilometers by default', function (assert) {
        approx(assert, haversine(BERLIN, PARIS), 877, 5, 'Berlin-Paris is ~877km');
    });

    test('it returns zero for identical coordinates', function (assert) {
        assert.strictEqual(haversine(BERLIN, BERLIN), 0);
    });

    test('it supports the unit option including the fallback default', function (assert) {
        approx(assert, haversine(BERLIN, PARIS, { unit: 'mile' }), 545, 5, 'distance in miles');
        approx(assert, haversine(BERLIN, PARIS, { unit: 'meter' }), 877000, 5000, 'distance in meters');
        approx(assert, haversine(BERLIN, PARIS, { unit: 'nmi' }), 473, 5, 'distance in nautical miles');
        approx(assert, haversine(BERLIN, PARIS, { unit: 'parsec' }), 877, 5, 'unknown unit falls back to km');
    });

    test('it supports coordinate format conversions', function (assert) {
        approx(assert, haversine([52.52, 13.405], [48.8566, 2.3522], { format: '[lat,lon]' }), 877, 5, '[lat,lon] format');
        approx(assert, haversine([13.405, 52.52], [2.3522, 48.8566], { format: '[lon,lat]' }), 877, 5, '[lon,lat] format');
        approx(assert, haversine({ lat: 52.52, lon: 13.405 }, { lat: 48.8566, lon: 2.3522 }, { format: '{lon,lat}' }), 877, 5, '{lon,lat} format');
        approx(assert, haversine({ lat: 52.52, lng: 13.405 }, { lat: 48.8566, lng: 2.3522 }, { format: '{lat,lng}' }), 877, 5, '{lat,lng} format');

        const geo = (lat, lon) => ({ geometry: { coordinates: [lon, lat] } });
        approx(assert, haversine(geo(52.52, 13.405), geo(48.8566, 2.3522), { format: 'geojson' }), 877, 5, 'geojson format');
    });

    test('it compares against a threshold when provided', function (assert) {
        assert.true(haversine(BERLIN, PARIS, { threshold: 1000 }));
        assert.false(haversine(BERLIN, PARIS, { threshold: 500 }));
    });
});

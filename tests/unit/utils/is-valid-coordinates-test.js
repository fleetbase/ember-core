import isValidCoordinates from 'dummy/utils/is-valid-coordinates';
import { module, test } from 'qunit';

module('Unit | Utility | is-valid-coordinates', function () {
    test('it validates [lat, lng] arrays', function (assert) {
        assert.true(isValidCoordinates([0, 0]));
        assert.true(isValidCoordinates([45, 120]));
        assert.false(isValidCoordinates([91, 0]));
        assert.false(isValidCoordinates([0, 181]));
        assert.false(isValidCoordinates([]));
    });

    test('it validates {lat, lng} and {latitude, longitude} objects', function (assert) {
        assert.true(isValidCoordinates({ lat: 10, lng: 20 }));
        assert.true(isValidCoordinates({ latitude: -45, longitude: 170 }));
        assert.false(isValidCoordinates({ lat: 100, lng: 20 }));
        assert.false(isValidCoordinates({}));
    });

    test('it validates separate latitude and longitude arguments', function (assert) {
        assert.true(isValidCoordinates(45, 90));
        assert.false(isValidCoordinates(45, 999));
        assert.false(isValidCoordinates('x', 'y'));
    });

    test('it rejects plain invalid input', function (assert) {
        assert.false(isValidCoordinates('nope'));
        assert.false(isValidCoordinates(undefined));
    });
});

import leafletIcon from 'dummy/utils/leaflet-icon';
import { module, test } from 'qunit';

// The util delegates to the global Leaflet installs. This addon never loads
// Leaflet, so the global is stubbed at that narrow boundary.
module('Unit | Utility | leaflet-icon', function (hooks) {
    hooks.beforeEach(function () {
        this.received = [];
        this.originalL = window.L;
        window.L = {
            icon: (options) => {
                this.received.push(options);
                return { type: 'icon', options };
            },
        };
    });

    hooks.afterEach(function () {
        if (this.originalL === undefined) {
            delete window.L;
        } else {
            window.L = this.originalL;
        }
    });

    test('it forwards options to Leaflet', function (assert) {
        const options = { iconUrl: '/marker.png', iconSize: [24, 24] };

        const icon = leafletIcon(options);

        assert.deepEqual(this.received, [options]);
        assert.strictEqual(icon.type, 'icon');
    });

    test('it defaults to an empty options object', function (assert) {
        leafletIcon();

        assert.deepEqual(this.received, [{}]);
    });
});

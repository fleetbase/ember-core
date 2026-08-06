import toLeafletBounds from 'dummy/utils/to-leaflet-bounds';
import { module, test } from 'qunit';

// `to-leaflet-bounds` reads the global `L` that Leaflet installs. This addon
// never loads Leaflet, so the global is stubbed at that narrow boundary.
class FakeBounds {
    constructor(a, b) {
        this.a = a;
        this.b = b;
    }
}

module('Unit | Utility | to-leaflet-bounds', function (hooks) {
    hooks.beforeEach(function () {
        this.originalL = window.L;
        window.L = { Bounds: FakeBounds };
    });

    hooks.afterEach(function () {
        if (this.originalL === undefined) {
            delete window.L;
        } else {
            window.L = this.originalL;
        }
    });

    test('it wraps corner values in a Leaflet bounds object', function (assert) {
        const bounds = toLeafletBounds([0, 0], [10, 10]);

        assert.true(bounds instanceof FakeBounds);
        assert.deepEqual(bounds.a, [0, 0]);
        assert.deepEqual(bounds.b, [10, 10]);
    });

    test('it passes an existing bounds object through unchanged', function (assert) {
        const existing = new FakeBounds([1, 1], [2, 2]);

        assert.strictEqual(toLeafletBounds(existing), existing);
    });

    test('it returns falsy input as-is rather than constructing bounds', function (assert) {
        assert.strictEqual(toLeafletBounds(null), null);
        assert.strictEqual(toLeafletBounds(undefined), undefined);
        assert.strictEqual(toLeafletBounds(0), 0);
    });
});

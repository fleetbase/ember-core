import { module, test } from 'qunit';
import { initialize } from 'dummy/initializers/load-socketcluster-client';

const MARKER_SELECTOR = 'script[data-socketcluster-client]';

/**
 * This initializer injects the SocketCluster client script, guarding against a
 * second insertion so engines can boot it more than once.
 *
 * Two things make this awkward to test, and both are deliberate:
 *
 * tests/helpers/stub-socketcluster.js plants a marker node carrying the same
 * `data-socketcluster-client` attribute, precisely so this guard trips and the
 * real client never loads during the suite. That marker must survive these
 * tests — removing it would let a later test pull in the real client, which is
 * what used to hang the run.
 *
 * And the creation path must not actually append: a real <script src> would
 * start a network request for the client this suite exists to avoid. So
 * appendChild is intercepted for the duration, which captures exactly what the
 * initializer built without inserting it.
 */
module('Unit | Initializer | load-socketcluster-client', function (hooks) {
    hooks.beforeEach(function () {
        this.marker = document.querySelector(MARKER_SELECTOR);
    });

    hooks.afterEach(function () {
        // Whatever happened above, the suite must leave with its marker.
        if (this.marker && !document.querySelector(MARKER_SELECTOR)) {
            document.body.appendChild(this.marker);
        }
    });

    test('the stub marker is in place, so the real client never loads', function (assert) {
        assert.ok(this.marker, 'tests/helpers/stub-socketcluster.js planted it');
    });

    test('it does nothing when a client script is already present', function (assert) {
        const before = document.querySelectorAll(MARKER_SELECTOR).length;

        initialize();

        assert.strictEqual(document.querySelectorAll(MARKER_SELECTOR).length, before, 'the guard makes repeat boots a no-op');
    });

    test('with no script present it builds and appends one', function (assert) {
        this.marker?.remove();
        const appended = [];
        const appendChild = document.body.appendChild;
        document.body.appendChild = (node) => {
            appended.push(node);
            return node;
        };

        try {
            initialize();
        } finally {
            document.body.appendChild = appendChild;
        }

        assert.strictEqual(appended.length, 1);
        assert.strictEqual(appended[0].tagName, 'SCRIPT');
        assert.strictEqual(appended[0].getAttribute('data-socketcluster-client'), '1', 'it plants its own guard attribute');
        assert.strictEqual(appended[0].getAttribute('src'), '/assets/socketcluster-client.min.js');
    });
});

import { module, test } from 'qunit';
import { initialize } from 'dummy/initializers/load-socketcluster-client';

/**
 * This initializer injects the SocketCluster client script tag. It guards
 * against inserting the same tag twice, which matters because engines boot the
 * initializer more than once.
 */
module('Unit | Initializer | load-socketcluster-client', function (hooks) {
    hooks.afterEach(function () {
        document.querySelectorAll('script[data-socketcluster-client]').forEach((node) => node.remove());
    });

    test('it appends the client script', function (assert) {
        initialize();

        const scripts = document.querySelectorAll('script[data-socketcluster-client]');
        assert.strictEqual(scripts.length, 1);
        // The literal attribute, not the `src` property — that one resolves to
        // an absolute URL against whatever host the test server is on.
        assert.strictEqual(scripts[0].getAttribute('src'), '/assets/socketcluster-client.min.js');
        assert.strictEqual(scripts[0].getAttribute('data-socketcluster-client'), '1');
    });

    test('the script is added to the body', function (assert) {
        initialize();

        assert.strictEqual(document.querySelector('script[data-socketcluster-client]').parentNode, document.body);
    });

    test('running it again does not add a second tag', function (assert) {
        initialize();
        initialize();
        initialize();

        assert.strictEqual(document.querySelectorAll('script[data-socketcluster-client]').length, 1, 'engines boot initializers more than once');
    });
});

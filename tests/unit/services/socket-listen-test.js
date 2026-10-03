import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';

/**
 * The body of `listen`'s async-iteration loop.
 *
 * The sibling socket test's channel reports `done` on the first pull, so the
 * loop never runs a single iteration. This one yields a couple of messages and
 * then finishes, which is what puts the callback dispatch under test.
 *
 * The global SocketCluster client is already replaced suite-wide by
 * tests/helpers/stub-socketcluster, so no real connection is ever opened.
 */
function fakeChannel(name, messages) {
    const queue = [...messages];

    return {
        name,
        closed: false,
        [Symbol.asyncIterator]() {
            return {
                next: () => Promise.resolve(queue.length ? { done: false, value: queue.shift() } : { done: true, value: undefined }),
            };
        },
        listener() {
            return { once: () => Promise.resolve() };
        },
        close() {
            this.closed = true;
        },
    };
}

module('Unit | Service | socket (listening)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.messages = ['first', 'second'];
        const testContext = this;

        this.originalClient = window.socketClusterClient;
        window.socketClusterClient = {
            create() {
                return {
                    subscribe(channelId) {
                        return fakeChannel(channelId, testContext.messages);
                    },
                };
            },
        };

        this.service = this.owner.factoryFor('service:socket').create();
    });

    hooks.afterEach(function () {
        if (this.originalClient !== undefined) {
            window.socketClusterClient = this.originalClient;
        }
    });

    test('each message reaches the callback', async function (assert) {
        const received = [];

        this.service.listen('company.abc', (output) => received.push(output));
        await settled();

        assert.deepEqual(received, ['first', 'second']);
    });

    test('a channel that yields nothing calls back not at all', async function (assert) {
        this.messages = [];
        const received = [];

        this.service.listen('company.abc', (output) => received.push(output));
        await settled();

        assert.deepEqual(received, []);
    });

    test('a missing callback is tolerated while the messages drain', async function (assert) {
        this.service.listen('company.abc');
        await settled();

        assert.strictEqual(this.service.channels.length, 1, 'the channel is still tracked');
    });

    test('a non-function callback is ignored the same way', async function (assert) {
        this.service.listen('company.abc', 'not a function');
        await settled();

        assert.strictEqual(this.service.channels.length, 1);
    });
});

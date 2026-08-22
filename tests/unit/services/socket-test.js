import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';
import config from 'dummy/config/environment';

// The global SocketCluster client is replaced for the whole suite by
// tests/helpers/stub-socketcluster, so no real connection is ever opened. These
// tests install their own richer stub to observe what the service asks for.
function fakeChannel(name) {
    return {
        name,
        closed: false,
        subscribeResolved: false,
        [Symbol.asyncIterator]() {
            return { next: () => Promise.resolve({ done: true, value: undefined }) };
        },
        listener() {
            return {
                once: () => {
                    this.subscribeResolved = true;
                    return Promise.resolve();
                },
            };
        },
        close() {
            this.closed = true;
        },
    };
}

module('Unit | Service | socket', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.created = [];
        this.subscribed = [];
        const testContext = this;

        this.originalClient = window.socketClusterClient;
        window.socketClusterClient = {
            create(socketConfig) {
                testContext.created.push(socketConfig);
                return {
                    subscribe(channelId) {
                        const channel = fakeChannel(channelId);
                        testContext.subscribed.push(channel);
                        return channel;
                    },
                };
            },
        };
    });

    hooks.afterEach(function () {
        window.socketClusterClient = this.originalClient;
    });

    test('it builds a client from the application socket config', function (assert) {
        this.owner.lookup('service:socket');

        assert.strictEqual(this.created.length, 1, 'exactly one client is created');
        assert.strictEqual(this.created[0].hostname, config.socket.hostname);
    });

    test('it falls back to the current hostname when none is configured', function (assert) {
        const originalHostname = config.socket.hostname;
        config.socket.hostname = '';

        try {
            this.owner.lookup('service:socket');
            assert.strictEqual(this.created[0].hostname, window.location.hostname);
        } finally {
            config.socket.hostname = originalHostname;
        }
    });

    test('it coerces the secure flag to a boolean', function (assert) {
        const original = config.socket.secure;
        config.socket.secure = 'true';

        try {
            this.owner.lookup('service:socket');
            assert.true(this.created[0].secure);
        } finally {
            config.socket.secure = original;
        }
    });

    test('instance returns the underlying client', function (assert) {
        const service = this.owner.lookup('service:socket');

        assert.strictEqual(service.instance(), service.socket);
        assert.strictEqual(typeof service.instance().subscribe, 'function');
    });

    test('it starts with no channels', function (assert) {
        assert.deepEqual(this.owner.lookup('service:socket').channels, []);
    });

    test('listen subscribes and tracks the channel', async function (assert) {
        const service = this.owner.lookup('service:socket');

        service.listen('order.1', () => {});
        await settled();

        assert.strictEqual(this.subscribed.length, 1);
        assert.strictEqual(this.subscribed[0].name, 'order.1');
        assert.strictEqual(service.channels.length, 1, 'the channel is tracked on the service');
        assert.true(this.subscribed[0].subscribeResolved, 'it waits for the subscribe listener');
    });

    test('listen tracks each channel separately', async function (assert) {
        const service = this.owner.lookup('service:socket');

        service.listen('order.1', () => {});
        service.listen('order.2', () => {});
        await settled();

        assert.deepEqual(
            service.channels.map((channel) => channel.name),
            ['order.1', 'order.2']
        );
    });

    test('listen tolerates a missing callback', async function (assert) {
        const service = this.owner.lookup('service:socket');

        service.listen('order.1');
        await settled();

        assert.strictEqual(service.channels.length, 1);
    });

    test('closeChannels closes every tracked channel', async function (assert) {
        const service = this.owner.lookup('service:socket');

        service.listen('order.1', () => {});
        service.listen('order.2', () => {});
        await settled();

        service.closeChannels();

        assert.deepEqual(
            service.channels.map((channel) => channel.closed),
            [true, true]
        );
    });

    test('closeChannels is safe with nothing subscribed', function (assert) {
        const service = this.owner.lookup('service:socket');

        service.closeChannels();

        assert.deepEqual(service.channels, []);
    });
});

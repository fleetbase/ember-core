/**
 * Keeps the real SocketCluster client out of the test suite.
 *
 * The socket service builds a client in its constructor, and socketcluster-client
 * retries a failed connection forever. Under test that means an endless stream of
 * `WebSocket connection to 'ws://localhost:PORT/socketcluster/' failed`, the page
 * never goes idle, and the run never finishes.
 *
 * Two things have to be prevented:
 *   1. the `load-socketcluster-client` initializer injecting the real script — we
 *      reuse its own `data-socketcluster-client` guard by planting a marker node,
 *      so no production code has to change; and
 *   2. the global itself, which is replaced with an inert fake.
 *
 * Tests that exercise socket behaviour should register their own fake on the owner
 * rather than relying on the shape of this one.
 */
const MARKER_SELECTOR = 'script[data-socketcluster-client]';

function createFakeChannel(name) {
    return {
        name,
        // socketcluster channels are async iterables; an immediately-done iterator
        // keeps `for await (... of channel)` loops from suspending forever.
        [Symbol.asyncIterator]() {
            return { next: () => Promise.resolve({ done: true, value: undefined }) };
        },
        listener() {
            return { once: () => Promise.resolve() };
        },
        unsubscribe() {},
        close() {},
    };
}

export function createFakeSocketClusterClient() {
    return {
        create() {
            return {
                subscribe: (channelId) => createFakeChannel(channelId),
                transmit() {},
                invoke: () => Promise.resolve(),
                closeAllChannels() {},
                disconnect() {},
                listener() {
                    return { once: () => Promise.resolve() };
                },
            };
        },
    };
}

export default function stubSocketCluster() {
    if (!document.querySelector(MARKER_SELECTOR)) {
        const marker = document.createElement('script');
        marker.setAttribute('data-socketcluster-client', '1');
        // Deliberately has no `src`: it only satisfies the initializer's guard.
        document.body.appendChild(marker);
    }

    window.socketClusterClient = createFakeSocketClusterClient();
}

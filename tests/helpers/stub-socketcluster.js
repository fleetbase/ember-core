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
 * Tests that exercise socket behaviour swap in their own fake (see
 * createRecordingClient) rather than relying on the shape of the inert one.
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

/**
 * A client-level event listener that is both awaitable once and async-iterable;
 * the iterator finishes immediately so the socket service's event loops end.
 */
function inertListener() {
    return {
        once: () => Promise.resolve(),
        [Symbol.asyncIterator]() {
            return { next: () => Promise.resolve({ done: true, value: undefined }) };
        },
    };
}

/**
 * The client methods the socket service calls on every instance, as no-ops.
 * Test fakes spread this in so they only spell out what they observe.
 */
export function inertClientMethods() {
    return {
        OPEN: 'open',
        CLOSED: 'closed',
        AUTHENTICATED: 'authenticated',
        UNAUTHENTICATED: 'unauthenticated',
        state: 'closed',
        authState: 'unauthenticated',
        signedAuthToken: null,
        listener: inertListener,
        closeListener() {},
        authenticate: () => Promise.resolve({ isAuthenticated: false }),
        connect() {},
        disconnect() {},
    };
}

export function createFakeSocketClusterClient() {
    return {
        create() {
            return {
                ...inertClientMethods(),
                subscribe: (channelId) => createFakeChannel(channelId),
                transmit() {},
                invoke: () => Promise.resolve(),
                closeAllChannels() {},
            };
        },
    };
}

/**
 * An async-iterable event stream that stays open until closed, so a test can
 * push client events (deauthenticate, kickOut, subscribeFail, connect) into the
 * socket service's listeners.
 */
export function createEventStream() {
    const queue = [];
    const waiting = [];
    let closed = false;

    return {
        push(value) {
            if (waiting.length) {
                waiting.shift()({ done: false, value });
            } else {
                queue.push(value);
            }
        },
        close() {
            closed = true;
            while (waiting.length) {
                waiting.shift()({ done: true, value: undefined });
            }
        },
        once: () => Promise.resolve(),
        [Symbol.asyncIterator]() {
            return {
                next() {
                    if (queue.length) {
                        return Promise.resolve({ done: false, value: queue.shift() });
                    }
                    if (closed) {
                        return Promise.resolve({ done: true, value: undefined });
                    }
                    return new Promise((resolve) => waiting.push(resolve));
                },
            };
        },
    };
}

/**
 * A SocketCluster client fake that records what the socket service does with it
 * and lets a test emit client events. `authenticate` accepts every token unless
 * `client.authenticateImpl` is replaced.
 */
export function createRecordingClient() {
    const streams = {};
    const client = {
        ...inertClientMethods(),
        state: 'open',
        subscribed: [],
        authenticated: [],
        closedListeners: [],
        connects: 0,
        disconnects: 0,
        listener(eventName) {
            if (!streams[eventName]) {
                streams[eventName] = createEventStream();
            }
            return streams[eventName];
        },
        closeListener(eventName) {
            client.closedListeners.push(eventName);
            client.listener(eventName).close();
        },
        emit(eventName, data) {
            client.listener(eventName).push(data);
        },
        subscribe(channelName) {
            client.subscribed.push(channelName);
            return createFakeChannel(channelName);
        },
        authenticateImpl(token) {
            client.authState = client.AUTHENTICATED;
            client.signedAuthToken = token;
            return Promise.resolve({ isAuthenticated: true, authError: null });
        },
        authenticate(token) {
            client.authenticated.push(token);
            return client.authenticateImpl(token);
        },
        connect() {
            client.connects++;
        },
        disconnect() {
            client.disconnects++;
            client.state = client.CLOSED;
        },
    };

    return client;
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

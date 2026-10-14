import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { run } from '@ember/runloop';
import { settled } from '@ember/test-helpers';
import config from 'dummy/config/environment';
import { createRecordingClient } from 'dummy/tests/helpers/stub-socketcluster';
import {
    TOKEN_PATH,
    TOKEN_NAMESPACE,
    REFRESH_LEEWAY_SECONDS,
    MIN_REFRESH_DELAY_MS,
    MAX_RECOVERIES_PER_WINDOW,
    RECOVERY_WINDOW_MS,
    CLIENT_EVENTS,
    clientTag,
    subscribeFailReason,
    parseTokenResponse,
} from '@fleetbase/ember-core/services/socket';

/**
 * Socket authentication: the in-memory auth engine, token refresh, recovery
 * after the server drops the token or kicks the client out of channels, and the
 * session lifecycle (login, restore, organization switch, logout).
 *
 * The SocketCluster global is swapped for a recording fake (see
 * tests/helpers/stub-socketcluster), and the session, fetch and universe
 * services are replaced with small stubs so each test controls whether there is
 * a session and what the mint route answers.
 */

// Lets the service's async event loops and promise chains run.
async function flush() {
    for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

function authError(reason) {
    const error = new Error(`Subscription to channel denied: ${reason}`);
    error.name = 'AuthError';
    error.reason = reason;
    return error;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

class SessionStub extends Service {
    isAuthenticated = true;
}

// Records mint requests; by default every call mints a new token valid for 15 minutes.
class FetchStub extends Service {
    calls = [];
    responder = (call) => Promise.resolve({ token: `token-${call}`, expires_in: 900, expires_at: '2026-01-01T00:15:00Z' });

    post(path, data, options) {
        this.calls.push({ path, data, options });
        return this.responder(this.calls.length);
    }
}

class UniverseStub extends Service.extend(Evented) {}

module('Unit | Service | socket (authentication)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        const testContext = this;
        this.created = [];

        this.originalClient = window.socketClusterClient;
        window.socketClusterClient = {
            create(socketConfig) {
                const client = createRecordingClient();
                testContext.created.push(socketConfig);
                testContext.client = client;
                return client;
            },
        };

        this.owner.register('service:session', SessionStub);
        this.owner.register('service:fetch', FetchStub);
        this.owner.register('service:universe', UniverseStub);

        this.session = this.owner.lookup('service:session');
        this.fetch = this.owner.lookup('service:fetch');
        this.universe = this.owner.lookup('service:universe');
        this.service = this.owner.lookup('service:socket');
        this.authEngine = this.created[0].authEngine;
    });

    hooks.afterEach(function () {
        window.socketClusterClient = this.originalClient;
    });

    // -------------------------------------------------------------------------
    // Pure helpers
    // -------------------------------------------------------------------------

    test('clientTag names the console and its version', function (assert) {
        assert.strictEqual(clientTag({ version: '0.7.69' }), 'console/0.7.69');
        assert.strictEqual(clientTag({}), 'console/unknown');
    });

    test('subscribeFailReason reads the reason off authorization errors only', function (assert) {
        assert.strictEqual(subscribeFailReason(authError('no_token')), 'no_token');

        const other = new Error('Socket hung up');
        other.name = 'BadConnectionError';
        other.reason = 'no_token';
        assert.strictEqual(subscribeFailReason(other), null);
    });

    test('parseTokenResponse accepts only a token with a positive lifetime', function (assert) {
        assert.strictEqual(parseTokenResponse(null), null);
        assert.strictEqual(parseTokenResponse({ expires_in: 900 }), null);
        assert.strictEqual(parseTokenResponse({ token: 'abc', expires_in: 0 }), null);
        assert.strictEqual(parseTokenResponse({ token: 'abc', expires_in: 'soon' }), null);
        assert.deepEqual(parseTokenResponse({ token: 'abc', expires_in: '900' }), { token: 'abc', expiresIn: 900 });
    });

    // -------------------------------------------------------------------------
    // Client construction
    // -------------------------------------------------------------------------

    test('the client gets the in-memory auth engine and a client tag in the query', function (assert) {
        const socketConfig = this.created[0];

        assert.strictEqual(socketConfig.authEngine, this.service.authEngine);
        assert.strictEqual(typeof socketConfig.authEngine.loadToken, 'function');
        assert.strictEqual(socketConfig.query.client, clientTag(config));
        assert.notOk('token' in socketConfig.query, 'the token never travels in the URL');
    });

    test('an existing query in the socket config is kept', function (assert) {
        const original = config.socket.query;
        config.socket.query = { region: 'a' };

        try {
            const service = this.owner.factoryFor('service:socket').create();
            const socketConfig = this.created[this.created.length - 1];

            assert.deepEqual(socketConfig.query, { region: 'a', client: clientTag(config) });
            run(() => service.destroy());
        } finally {
            config.socket.query = original;
        }
    });

    // -------------------------------------------------------------------------
    // Auth engine
    // -------------------------------------------------------------------------

    test('loadToken connects anonymously without a session', async function (assert) {
        this.session.isAuthenticated = false;

        assert.strictEqual(await this.authEngine.loadToken('socketcluster.authToken'), null);
        assert.strictEqual(this.fetch.calls.length, 0, 'no token is requested');
    });

    test('loadToken mints a token from the console session route', async function (assert) {
        const token = await this.authEngine.loadToken('socketcluster.authToken');

        assert.strictEqual(token, 'token-1');
        assert.strictEqual(this.fetch.calls.length, 1);
        assert.strictEqual(this.fetch.calls[0].path, TOKEN_PATH);
        assert.strictEqual(this.fetch.calls[0].options.namespace, TOKEN_NAMESPACE);
        assert.strictEqual(TOKEN_NAMESPACE, 'int/v1');
    });

    test('a cached token is reused while it is comfortably valid', async function (assert) {
        await this.authEngine.loadToken();
        const second = await this.authEngine.loadToken();

        assert.strictEqual(second, 'token-1');
        assert.strictEqual(this.fetch.calls.length, 1, 'only one request was made');
    });

    test('a token inside the refresh leeway is replaced', async function (assert) {
        this.fetch.responder = (call) => Promise.resolve({ token: `token-${call}`, expires_in: REFRESH_LEEWAY_SECONDS - 1 });

        assert.strictEqual(await this.authEngine.loadToken(), 'token-1');
        assert.strictEqual(await this.authEngine.loadToken(), 'token-2');
    });

    test('concurrent loads share one request', async function (assert) {
        const pending = deferred();
        this.fetch.responder = () => pending.promise;

        const first = this.authEngine.loadToken();
        const second = this.authEngine.loadToken();
        pending.resolve({ token: 'shared', expires_in: 900 });

        assert.deepEqual(await Promise.all([first, second]), ['shared', 'shared']);
        assert.strictEqual(this.fetch.calls.length, 1);
        assert.strictEqual(this.service.tokenRequest, null, 'the finished request is released');
    });

    test('a failed mint request (e.g. 404 from an older server) falls back to anonymous', async function (assert) {
        this.fetch.responder = () => Promise.reject(new Error('Not Found'));

        assert.strictEqual(await this.authEngine.loadToken(), null);
        assert.strictEqual(this.service.tokenState, null);
        assert.strictEqual(this.service.refreshTimer, null, 'nothing is scheduled');
    });

    test('a malformed mint response falls back to anonymous', async function (assert) {
        this.fetch.responder = () => Promise.resolve({ token: 'abc' });

        assert.strictEqual(await this.authEngine.loadToken(), null);
        assert.strictEqual(this.service.tokenState, null);
    });

    test('saveToken keeps nothing outside memory', async function (assert) {
        assert.strictEqual(await this.authEngine.saveToken('socketcluster.authToken', 'abc', {}), 'abc');
        assert.strictEqual(window.localStorage.getItem('socketcluster.authToken'), null);
    });

    test('removeToken forgets the token and returns it', async function (assert) {
        await this.authEngine.loadToken();

        assert.strictEqual(await this.authEngine.removeToken('socketcluster.authToken'), 'token-1');
        assert.strictEqual(this.service.tokenState, null);
        assert.strictEqual(this.service.refreshTimer, null);
        assert.strictEqual(await this.authEngine.removeToken('socketcluster.authToken'), null, 'nothing left to remove');
    });

    test('a token that arrives after logout is discarded', async function (assert) {
        const stale = deferred();
        this.fetch.responder = () => stale.promise;

        const load = this.authEngine.loadToken();
        this.service.handleLogout();

        // The next session's request is separate from the stale one.
        this.fetch.responder = () => Promise.resolve({ token: 'fresh', expires_in: 900 });
        const next = this.service.getToken();
        assert.notStrictEqual(next, load);

        stale.resolve({ token: 'stale', expires_in: 900 });

        assert.strictEqual(await load, null);
        assert.strictEqual(await next, 'fresh');
        assert.strictEqual(this.service.tokenState.token, 'fresh', 'the stale token never landed');
        assert.strictEqual(this.service.tokenRequest, null);
    });

    // -------------------------------------------------------------------------
    // Refresh
    // -------------------------------------------------------------------------

    test('the refresh timer fires the leeway before expiry, with a floor', function (assert) {
        const scheduled = [];
        const originalSetTimeout = window.setTimeout;
        window.setTimeout = (callback, delay) => {
            scheduled.push({ callback, delay });
            // Negative ids can never clear a real timer when the service cancels.
            return -scheduled.length;
        };

        try {
            this.service.scheduleRefresh(900);
            this.service.scheduleRefresh(10);
        } finally {
            window.setTimeout = originalSetTimeout;
        }

        assert.strictEqual(scheduled[0].delay, (900 - REFRESH_LEEWAY_SECONDS) * 1000);
        assert.strictEqual(scheduled[1].delay, MIN_REFRESH_DELAY_MS);

        let refreshed = 0;
        this.service.refreshToken = () => refreshed++;
        scheduled[1].callback();

        assert.strictEqual(refreshed, 1, 'the timer refreshes the token');
        assert.strictEqual(this.service.refreshTimer, null);
    });

    test('minting a token arms the refresh timer', async function (assert) {
        await this.authEngine.loadToken();

        assert.notStrictEqual(this.service.refreshTimer, null);
    });

    test('refreshToken does nothing without a session', async function (assert) {
        this.session.isAuthenticated = false;

        assert.strictEqual(await this.service.refreshToken(), null);
        assert.strictEqual(this.fetch.calls.length, 0);
    });

    test('refreshToken re-authenticates the open socket with a new token', async function (assert) {
        await this.authEngine.loadToken();

        assert.strictEqual(await this.service.refreshToken(), 'token-2', 'the cached token is not reused');
        assert.deepEqual(this.client.authenticated, ['token-2']);
    });

    test('refreshToken only caches the token while disconnected', async function (assert) {
        this.client.state = this.client.CLOSED;

        assert.strictEqual(await this.service.refreshToken(), 'token-1');
        assert.deepEqual(this.client.authenticated, []);
        assert.strictEqual(await this.authEngine.loadToken(), 'token-1', 'the next handshake uses it');
    });

    test('refreshToken skips authentication when no token could be minted', async function (assert) {
        this.fetch.responder = () => Promise.reject(new Error('Not Found'));

        assert.strictEqual(await this.service.refreshToken(), null);
        assert.deepEqual(this.client.authenticated, []);
    });

    test('a rejected token is forgotten', async function (assert) {
        await this.authEngine.loadToken();
        this.client.authenticateImpl = () => Promise.resolve({ isAuthenticated: false, authError: new Error('bad') });

        assert.false(await this.service.authenticateWith('token-1'));
        assert.strictEqual(this.service.tokenState, null);
        assert.false(this.service.authenticating);
    });

    test('a failed authenticate call is treated as a rejection', async function (assert) {
        await this.authEngine.loadToken();
        this.client.authenticateImpl = () => Promise.reject(new Error('TimeoutError'));

        assert.false(await this.service.authenticateWith('token-1'));
        assert.strictEqual(this.service.tokenState, null);
        assert.false(this.service.authenticating);
    });

    // -------------------------------------------------------------------------
    // reauthenticate (login, restore, organization switch)
    // -------------------------------------------------------------------------

    test('reauthenticate does nothing without a session', async function (assert) {
        this.session.isAuthenticated = false;

        assert.false(await this.service.reauthenticate());
        assert.strictEqual(this.fetch.calls.length, 0);
    });

    test('reauthenticate reconnects a closed socket and lets the handshake load the token', async function (assert) {
        await this.authEngine.loadToken();
        this.client.state = this.client.CLOSED;

        assert.false(await this.service.reauthenticate());
        assert.strictEqual(this.client.connects, 1);
        assert.strictEqual(this.service.tokenState, null, 'the old token is discarded');
    });

    test('reauthenticate with force mints a new token for the open socket', async function (assert) {
        await this.authEngine.loadToken();

        assert.true(await this.service.reauthenticate({ force: true }));
        assert.deepEqual(this.client.authenticated, ['token-2']);
    });

    test('reauthenticate without force reuses the cached token', async function (assert) {
        await this.authEngine.loadToken();

        assert.true(await this.service.reauthenticate({ force: false }));
        assert.deepEqual(this.client.authenticated, ['token-1']);
        assert.strictEqual(this.fetch.calls.length, 1);
    });

    test('reauthenticate reports failure when no token can be minted', async function (assert) {
        this.fetch.responder = () => Promise.reject(new Error('Not Found'));

        assert.false(await this.service.reauthenticate());
        assert.deepEqual(this.client.authenticated, []);
    });

    test('login authenticates the socket', async function (assert) {
        this.universe.trigger('session.authenticated');
        await flush();

        assert.deepEqual(this.client.authenticated, ['token-1']);
    });

    test('a restored session authenticates an anonymous socket', async function (assert) {
        this.universe.trigger('user.loaded');
        await flush();

        assert.deepEqual(this.client.authenticated, ['token-1']);
    });

    test('a restored session leaves an authenticated socket alone', async function (assert) {
        this.client.authState = this.client.AUTHENTICATED;

        assert.strictEqual(this.service.handleUserLoaded(), null);
        assert.strictEqual(this.fetch.calls.length, 0);
    });

    test('an organization switch re-keys the socket with a new token', async function (assert) {
        await this.authEngine.loadToken();

        this.universe.trigger('user.organization_switched', { id: 'org-2' });
        await flush();

        assert.deepEqual(this.client.authenticated, ['token-2']);
    });

    test('logout clears the token, timers and retries and disconnects', async function (assert) {
        await this.authEngine.loadToken();
        this.service.pendingChannels.add('order.1');
        this.service.retriedChannels.set('order.2', 'token-1');
        this.service.recoveryLog = [Date.now()];

        this.universe.trigger('user.deauthenticated');

        assert.strictEqual(this.service.tokenState, null);
        assert.strictEqual(this.service.refreshTimer, null);
        assert.strictEqual(this.service.pendingChannels.size, 0);
        assert.strictEqual(this.service.retriedChannels.size, 0);
        assert.deepEqual(this.service.recoveryLog, []);
        assert.strictEqual(this.client.disconnects, 1);
    });

    // -------------------------------------------------------------------------
    // Recovery
    // -------------------------------------------------------------------------

    test('an anonymous handshake with a session is authenticated on connect', async function (assert) {
        assert.true(await this.service.handleConnect());
        assert.deepEqual(this.client.authenticated, ['token-1']);
    });

    test('connect is ignored when already authenticated or signed out', function (assert) {
        this.client.authState = this.client.AUTHENTICATED;
        assert.strictEqual(this.service.handleConnect(), null);

        this.client.authState = this.client.UNAUTHENTICATED;
        this.session.isAuthenticated = false;
        assert.strictEqual(this.service.handleConnect(), null);
        assert.strictEqual(this.fetch.calls.length, 0);
    });

    test('deauthentication mints a new token and re-authenticates', async function (assert) {
        await this.authEngine.loadToken();

        assert.true(await this.service.handleDeauthenticate());
        assert.deepEqual(this.client.authenticated, ['token-2'], 'the dropped token is not reused');
    });

    test('deauthentication caused by our own authenticate call is ignored', function (assert) {
        this.service.authenticating = true;

        assert.strictEqual(this.service.handleDeauthenticate(), null);
        assert.strictEqual(this.fetch.calls.length, 0);
    });

    test('deauthentication after sign-out is ignored', function (assert) {
        this.session.isAuthenticated = false;

        assert.strictEqual(this.service.handleDeauthenticate(), null);
    });

    test('a channel lost for a token reason is resubscribed after re-authenticating', async function (assert) {
        assert.true(await this.service.handleChannelLoss('order.1', 'token_expired'));
        assert.deepEqual(this.client.authenticated, ['token-1']);
        assert.deepEqual(this.client.subscribed, ['order.1']);
    });

    test('a channel the user may not see is not retried', function (assert) {
        assert.strictEqual(this.service.handleChannelLoss('order.1', 'forbidden'), null);
        assert.strictEqual(this.service.handleChannelLoss('order.1', null), null);
        assert.strictEqual(this.fetch.calls.length, 0);
    });

    test('channel losses after sign-out are not retried', function (assert) {
        this.session.isAuthenticated = false;

        assert.strictEqual(this.service.handleChannelLoss('order.1', 'no_token'), null);
    });

    test('recovery skips authenticate when the socket already holds the token', async function (assert) {
        await this.authEngine.loadToken();
        this.client.authState = this.client.AUTHENTICATED;
        this.client.signedAuthToken = 'token-1';

        assert.true(await this.service.handleChannelLoss('order.1', 'identity_changed'));
        assert.deepEqual(this.client.authenticated, []);
        assert.deepEqual(this.client.subscribed, ['order.1']);
    });

    test('recovery re-authenticates a socket holding a different token', async function (assert) {
        this.client.authState = this.client.AUTHENTICATED;
        this.client.signedAuthToken = 'previous-organization';

        assert.true(await this.service.handleChannelLoss('order.1', 'identity_changed'));
        assert.deepEqual(this.client.authenticated, ['token-1']);
        assert.deepEqual(this.client.subscribed, ['order.1']);
    });

    test('recovery gives up when no token can be minted', async function (assert) {
        this.fetch.responder = () => Promise.reject(new Error('Not Found'));

        assert.false(await this.service.handleChannelLoss('order.1', 'no_token'));
        assert.deepEqual(this.client.subscribed, []);
        assert.strictEqual(this.service.pendingChannels.size, 0);
    });

    test('recovery gives up when the token is rejected', async function (assert) {
        this.client.authenticateImpl = () => Promise.resolve({ isAuthenticated: false });

        assert.false(await this.service.handleChannelLoss('order.1', 'no_token'));
        assert.deepEqual(this.client.subscribed, []);
        assert.strictEqual(this.service.pendingChannels.size, 0);
    });

    test('a channel is retried at most once per token', async function (assert) {
        await this.service.handleChannelLoss('order.1', 'token_changed');
        await this.service.handleChannelLoss('order.1', 'token_changed');

        assert.deepEqual(this.client.subscribed, ['order.1'], 'the second loss with the same token is not retried');

        // A new token earns the channel another attempt.
        await this.service.reauthenticate({ force: true });
        await this.service.handleChannelLoss('order.1', 'token_changed');

        assert.deepEqual(this.client.subscribed, ['order.1', 'order.1']);
    });

    test('losses reported during a recovery are batched into it', async function (assert) {
        const pending = deferred();
        this.fetch.responder = () => pending.promise;

        const first = this.service.handleChannelLoss('order.1', 'deauthenticated');
        const second = this.service.handleChannelLoss('order.2', 'deauthenticated');
        assert.strictEqual(first, second, 'one recovery is shared');

        pending.resolve({ token: 'shared', expires_in: 900 });
        await first;

        assert.deepEqual(this.client.authenticated, ['shared']);
        assert.deepEqual(this.client.subscribed, ['order.1', 'order.2']);
    });

    test('a loss reported while resubscribing gets a follow-up recovery', async function (assert) {
        const service = this.service;
        const client = this.client;
        const originalSubscribe = client.subscribe;
        client.subscribe = (channelName) => {
            if (channelName === 'order.1') {
                // The server refuses the next channel while we are still resubscribing.
                service.handleChannelLoss('order.2', 'token_expired');
            }
            return originalSubscribe(channelName);
        };

        await service.handleChannelLoss('order.1', 'token_expired');
        await flush();

        assert.deepEqual(client.subscribed, ['order.1', 'order.2']);
        assert.strictEqual(service.recovery, null);
    });

    test('recoveries are capped per window', async function (assert) {
        for (let i = 0; i < MAX_RECOVERIES_PER_WINDOW; i++) {
            assert.true(await this.service.handleChannelLoss(`order.${i}`, 'no_token'));
        }

        assert.false(await this.service.handleChannelLoss('order.extra', 'no_token'), 'the next one is refused');
        assert.notOk(this.client.subscribed.includes('order.extra'));
        assert.strictEqual(this.service.pendingChannels.size, 0);
    });

    test('old recoveries fall out of the window', async function (assert) {
        const longAgo = Date.now() - RECOVERY_WINDOW_MS - 1;
        this.service.recoveryLog = Array(MAX_RECOVERIES_PER_WINDOW).fill(longAgo);

        assert.true(await this.service.handleChannelLoss('order.1', 'no_token'));
        assert.strictEqual(this.service.recoveryLog.length, 1);
    });

    // -------------------------------------------------------------------------
    // Client event wiring and teardown
    // -------------------------------------------------------------------------

    test('client events reach their handlers', async function (assert) {
        this.client.emit('subscribeFail', { channel: 'order.1', error: authError('no_token') });
        await flush();
        assert.deepEqual(this.client.subscribed, ['order.1'], 'subscribeFail with an auth reason resubscribes');

        this.client.emit('kickOut', { channel: 'order.2', message: 'token_expired' });
        await flush();
        assert.deepEqual(this.client.subscribed, ['order.1', 'order.2'], 'kickOut with an auth reason resubscribes');

        this.client.authState = this.client.UNAUTHENTICATED;
        this.client.emit('deauthenticate', {});
        await flush();
        assert.deepEqual(this.client.authenticated, ['token-1', 'token-2'], 'deauthenticate mints and authenticates');

        this.service.recoveryLog = [];
        this.client.authState = this.client.UNAUTHENTICATED;
        this.client.emit('connect', {});
        await flush();
        assert.strictEqual(this.client.authenticated.length, 3, 'an anonymous connect authenticates');
    });

    test('teardown stops the timer and every listener', async function (assert) {
        await this.authEngine.loadToken();
        const client = this.client;
        const universe = this.universe;
        const service = this.service;

        run(() => service.destroy());
        await settled();

        assert.deepEqual(client.closedListeners, CLIENT_EVENTS);
        assert.strictEqual(service.refreshTimer, null);

        universe.trigger('user.deauthenticated');
        assert.strictEqual(client.disconnects, 0, 'session events no longer reach the service');
    });
});

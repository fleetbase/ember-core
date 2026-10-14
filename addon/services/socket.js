import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { isBlank } from '@ember/utils';
import { later } from '@ember/runloop';
import { debug } from '@ember/debug';
import toBoolean from '../utils/to-boolean';
import config from 'ember-get-config';

/**
 * Console mint route for socket tokens, always on the internal namespace
 * regardless of what the fetch service's namespace has been set to.
 */
export const TOKEN_PATH = 'socket/token';
export const TOKEN_NAMESPACE = 'int/v1';

/**
 * A cached token is reused only while it has more than this many seconds left,
 * and the refresh timer fires this many seconds before expiry.
 */
export const REFRESH_LEEWAY_SECONDS = 60;

/**
 * Floor for the refresh timer, so a server handing out very short-lived tokens
 * can never make the client spin.
 */
export const MIN_REFRESH_DELAY_MS = 5000;

/**
 * At most this many recoveries (fetch a token, authenticate, resubscribe) are
 * attempted within the window; beyond that the service stops trying until the
 * window has passed, so a server that keeps rejecting tokens cannot cause a loop.
 */
export const MAX_RECOVERIES_PER_WINDOW = 3;
export const RECOVERY_WINDOW_MS = 60000;

/**
 * Reasons the socket server gives (as a kickOut message or an AuthError's
 * `reason`) when a channel was lost because of the token rather than because
 * the user may not see the channel. Only these are retried with a fresh token.
 */
export const RETRYABLE_REASONS = ['no_token', 'token_expired', 'token_changed', 'deauthenticated', 'identity_changed'];

/**
 * Client events the service reacts to.
 */
export const CLIENT_EVENTS = ['connect', 'deauthenticate', 'kickOut', 'subscribeFail'];

/**
 * Universe events (fired by the session and current-user services) the service
 * reacts to, mapped to the handler that runs.
 */
export const SESSION_EVENTS = {
    'session.authenticated': 'handleLogin',
    'user.loaded': 'handleUserLoaded',
    'user.organization_switched': 'handleOrganizationSwitch',
    'user.deauthenticated': 'handleLogout',
};

/**
 * The `client` tag sent in the handshake query, used by the socket server to
 * attribute authorization decisions to an app and version. Not a secret.
 *
 * @param {Object} appConfig
 * @return {String}
 */
export function clientTag(appConfig) {
    return `console/${appConfig.version ?? 'unknown'}`;
}

/**
 * The server-side reason a subscription was refused, or null when the failure
 * was not an authorization failure.
 *
 * @param {Error} error
 * @return {String|null}
 */
export function subscribeFailReason(error) {
    return error.name === 'AuthError' ? error.reason : null;
}

/**
 * Validates a mint-route response. Returns null for anything that is not a
 * token with a positive lifetime, which the caller treats as "no token".
 *
 * @param {Object|null} response `{ token, expires_in, expires_at }`
 * @return {{token: String, expiresIn: Number}|null}
 */
export function parseTokenResponse(response) {
    if (!response || typeof response.token !== 'string') {
        return null;
    }

    const expiresIn = Number(response.expires_in);
    return expiresIn > 0 ? { token: response.token, expiresIn } : null;
}

/**
 * SocketService
 *
 * Owns the console's single SocketCluster client and keeps it authenticated
 * with short-lived socket tokens minted from the console session.
 *
 *   - The token is delivered in the handshake through an in-memory auth engine,
 *     so every connect and reconnect (and the subscriptions queued before it) is
 *     authenticated. Tokens are never written to localStorage or the URL.
 *   - When there is no session, or the server cannot mint tokens (older server or
 *     socket auth disabled), the client connects anonymously as it always has.
 *   - Tokens are refreshed shortly before they expire; when the server drops the
 *     token or kicks the client out of channels for a token reason, a fresh token
 *     is fetched and the lost channels are resubscribed by name, which also
 *     restores delivery to callers iterating channels from `instance().subscribe`.
 *   - Login, organization switches and logout re-key or tear down the socket.
 */
export default class SocketService extends Service {
    @service session;
    @service fetch;
    @service universe;

    @tracked channels = [];

    /** @type {{token: String, expiresAt: Number}|null} */
    tokenState = null;
    tokenRequest = null;
    refreshTimer = null;
    recovery = null;
    authenticating = false;
    generation = 0;
    recoveryLog = [];
    pendingChannels = new Set();
    retriedChannels = new Map();

    constructor() {
        super(...arguments);
        this.authEngine = this.createAuthEngine();
        this.socket = this.createSocketClusterClient();
        this.listenToClient();
        this.listenToSession();
    }

    willDestroy() {
        super.willDestroy(...arguments);
        this.cancelRefresh();

        for (const eventName of CLIENT_EVENTS) {
            this.socket.closeListener(eventName);
        }

        for (const [eventName, handler] of Object.entries(SESSION_EVENTS)) {
            this.sessionBus.off(eventName, this, this[handler]);
        }
    }

    instance() {
        return this.socket;
    }

    createSocketClusterClient() {
        const socketConfig = { ...config.socket };

        if (isBlank(socketConfig.hostname)) {
            socketConfig.hostname = window.location.hostname;
        }

        socketConfig.secure = toBoolean(socketConfig.secure);
        socketConfig.query = { ...socketConfig.query, client: clientTag(config) };
        socketConfig.authEngine = this.authEngine;

        return socketClusterClient.create(socketConfig);
    }

    /**
     * The auth engine handed to the SocketCluster client. It replaces the default
     * engine, which would persist the token in localStorage.
     *
     * @return {Object}
     */
    createAuthEngine() {
        return {
            // The only tokens the client is ever given are the ones this service
            // fetched and already holds in memory, so there is nothing to persist.
            saveToken: (name, token) => Promise.resolve(token),
            removeToken: () => {
                const previous = this.tokenState ? this.tokenState.token : null;
                this.forgetToken();
                return Promise.resolve(previous);
            },
            loadToken: () => this.loadToken(),
        };
    }

    /**
     * Resolves the token for a handshake: a fresh socket token while the session
     * is authenticated, otherwise null so the client connects anonymously.
     * Never rejects.
     *
     * @return {Promise<String|null>}
     */
    async loadToken() {
        if (!this.session.isAuthenticated) {
            return null;
        }

        return this.getToken();
    }

    /**
     * Returns the cached token while it has more than the leeway left, otherwise
     * fetches one. Concurrent callers share a single request.
     *
     * @param {Object} [options]
     * @param {Boolean} [options.force=false] ignore the cached token
     * @return {Promise<String|null>}
     */
    getToken({ force = false } = {}) {
        if (!force && this.hasFreshToken()) {
            return Promise.resolve(this.tokenState.token);
        }

        if (!this.tokenRequest) {
            const request = this.requestToken().finally(() => {
                if (this.tokenRequest === request) {
                    this.tokenRequest = null;
                }
            });
            this.tokenRequest = request;
        }

        return this.tokenRequest;
    }

    hasFreshToken() {
        return this.tokenState !== null && this.tokenState.expiresAt - Date.now() > REFRESH_LEEWAY_SECONDS * 1000;
    }

    /**
     * Mints a token from the console session. Any failure, including the 404 an
     * older server or one with socket auth disabled returns, resolves to null so
     * the socket falls back to an anonymous connection.
     *
     * @return {Promise<String|null>}
     */
    async requestToken() {
        const generation = this.generation;
        let response;

        try {
            response = await this.fetch.post(TOKEN_PATH, {}, { namespace: TOKEN_NAMESPACE });
        } catch (error) {
            debug(`[socket] socket token unavailable, connecting anonymously: ${error.message}`);
            return null;
        }

        // The session ended while the request was in flight.
        if (generation !== this.generation) {
            return null;
        }

        const parsed = parseTokenResponse(response);
        if (parsed === null) {
            debug('[socket] socket token response was malformed, connecting anonymously');
            return null;
        }

        this.tokenState = { token: parsed.token, expiresAt: Date.now() + parsed.expiresIn * 1000 };
        this.scheduleRefresh(parsed.expiresIn);

        return parsed.token;
    }

    /**
     * Arms the refresh timer for `expiresIn - leeway` seconds from now. A native
     * timer is used deliberately: a run-loop timer would hold the test waiters
     * (and `settled()`) open for the token's whole lifetime.
     *
     * @param {Number} expiresIn seconds until the token expires
     */
    scheduleRefresh(expiresIn) {
        this.cancelRefresh();

        const delay = Math.max((expiresIn - REFRESH_LEEWAY_SECONDS) * 1000, MIN_REFRESH_DELAY_MS);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            this.refreshToken();
        }, delay);
    }

    cancelRefresh() {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
    }

    forgetToken() {
        this.tokenState = null;
        this.cancelRefresh();
    }

    /**
     * Fetches a new token and, when connected, authenticates the open socket with
     * it. When the socket is not connected the new token simply waits in memory
     * for the next handshake.
     *
     * @return {Promise<String|null>}
     */
    async refreshToken() {
        if (!this.session.isAuthenticated) {
            return null;
        }

        const token = await this.getToken({ force: true });
        if (token !== null && this.isOpen()) {
            await this.authenticateWith(token);
        }

        return token;
    }

    /**
     * Re-keys the socket for the current session: used on login and when the
     * user switches organization (the old token names the old organization).
     *
     * @param {Object} [options]
     * @param {Boolean} [options.force=true] discard the cached token first
     * @return {Promise<Boolean>} whether the socket is now authenticated
     */
    async reauthenticate({ force = true } = {}) {
        if (!this.session.isAuthenticated) {
            return false;
        }

        if (force) {
            this.forgetToken();
        }

        // Not connected (logged out earlier, or between reconnect attempts): the
        // handshake loads the token itself.
        if (!this.isOpen()) {
            this.socket.connect();
            return false;
        }

        const token = await this.getToken();
        return token !== null && this.authenticateWith(token);
    }

    /**
     * @param {String} token
     * @return {Promise<Boolean>} whether the server accepted the token
     */
    async authenticateWith(token) {
        this.authenticating = true;

        try {
            const status = await this.socket.authenticate(token);
            if (status.isAuthenticated) {
                return true;
            }

            debug('[socket] socket token was rejected');
        } catch (error) {
            debug(`[socket] socket authentication failed: ${error.message}`);
        } finally {
            this.authenticating = false;
        }

        // A rejected token must not be offered again on the next handshake.
        this.forgetToken();
        return false;
    }

    isOpen() {
        return this.socket.state === this.socket.OPEN;
    }

    isAuthenticatedWith(token) {
        return this.socket.authState === this.socket.AUTHENTICATED && this.socket.signedAuthToken === token;
    }

    // -------------------------------------------------------------------------
    // Client events
    // -------------------------------------------------------------------------

    listenToClient() {
        this.consume('connect', () => this.handleConnect());
        this.consume('deauthenticate', () => this.handleDeauthenticate());
        this.consume('kickOut', (event) => this.handleChannelLoss(event.channel, event.message));
        this.consume('subscribeFail', (event) => this.handleChannelLoss(event.channel, subscribeFailReason(event.error)));
    }

    consume(eventName, handler) {
        const stream = this.socket.listener(eventName);

        (async () => {
            for await (const event of stream) {
                handler(event);
            }
        })();
    }

    /**
     * A handshake completed anonymously although there is a session: the socket
     * connected before the session was restored, or the token request failed.
     * Try once more now, within the recovery budget.
     */
    handleConnect() {
        if (this.socket.authState === this.socket.AUTHENTICATED || !this.session.isAuthenticated) {
            return null;
        }

        return this.recover();
    }

    /**
     * The server dropped the socket's token (it expired, or the server removed
     * it). Deauthentication caused by this service's own authenticate call is
     * ignored: that path already handles the rejected token.
     */
    handleDeauthenticate() {
        if (this.authenticating || !this.session.isAuthenticated) {
            return null;
        }

        this.forgetToken();
        return this.recover();
    }

    /**
     * A channel was kicked out or refused. Token-related losses are queued for
     * resubscription after re-authenticating; anything else (the user may not see
     * the channel) is left for the subscriber's own `subscribeFail` handling.
     *
     * @param {String} channelName
     * @param {String|null} reason
     */
    handleChannelLoss(channelName, reason) {
        if (!RETRYABLE_REASONS.includes(reason) || !this.session.isAuthenticated) {
            return null;
        }

        this.pendingChannels.add(channelName);
        return this.recover();
    }

    /**
     * Single-flight recovery. Losses reported while a recovery is running are
     * picked up by it, or by a follow-up run if they arrive after it resubscribed.
     *
     * @return {Promise<Boolean>}
     */
    recover() {
        if (!this.recovery) {
            this.recovery = this.runRecovery().finally(() => {
                this.recovery = null;

                if (this.pendingChannels.size > 0) {
                    this.recover();
                }
            });
        }

        return this.recovery;
    }

    async runRecovery() {
        if (!this.takeRecoveryBudget()) {
            debug('[socket] too many socket re-authentications, waiting before trying again');
            this.pendingChannels.clear();
            return false;
        }

        const token = await this.getToken();
        if (token === null) {
            this.pendingChannels.clear();
            return false;
        }

        if (!this.isAuthenticatedWith(token) && !(await this.authenticateWith(token))) {
            this.pendingChannels.clear();
            return false;
        }

        this.resubscribePending(token);
        return true;
    }

    takeRecoveryBudget() {
        const now = Date.now();
        this.recoveryLog = this.recoveryLog.filter((at) => now - at < RECOVERY_WINDOW_MS);

        if (this.recoveryLog.length >= MAX_RECOVERIES_PER_WINDOW) {
            return false;
        }

        this.recoveryLog.push(now);
        return true;
    }

    /**
     * Resubscribes lost channels by name. Each channel is retried at most once
     * per token, so a channel the server keeps refusing is not retried forever.
     *
     * @param {String} token the token the socket is now authenticated with
     */
    resubscribePending(token) {
        const channelNames = [...this.pendingChannels];
        this.pendingChannels.clear();

        for (const channelName of channelNames) {
            if (this.retriedChannels.get(channelName) === token) {
                debug(`[socket] not retrying channel ${channelName} again with the same token`);
                continue;
            }

            this.retriedChannels.set(channelName, token);
            this.socket.subscribe(channelName);
        }
    }

    // -------------------------------------------------------------------------
    // Session events
    // -------------------------------------------------------------------------

    listenToSession() {
        // Held directly so teardown does not have to look the service up again
        // while the owner is being destroyed.
        this.sessionBus = this.universe;

        for (const [eventName, handler] of Object.entries(SESSION_EVENTS)) {
            this.sessionBus.on(eventName, this, this[handler]);
        }
    }

    handleLogin() {
        return this.reauthenticate({ force: true });
    }

    /**
     * A restored session loads the user without a login event; if the socket
     * connected anonymously before the session was restored, authenticate it now.
     */
    handleUserLoaded() {
        if (this.socket.authState === this.socket.AUTHENTICATED) {
            return null;
        }

        return this.reauthenticate({ force: false });
    }

    handleOrganizationSwitch() {
        return this.reauthenticate({ force: true });
    }

    /**
     * Logout: drop the token and every pending retry, and close the connection so
     * nothing keeps flowing to a signed-out console. The next login reconnects.
     */
    handleLogout() {
        this.generation++;
        this.tokenRequest = null;
        this.forgetToken();
        this.pendingChannels.clear();
        this.retriedChannels.clear();
        this.recoveryLog = [];
        this.socket.disconnect();
    }

    // -------------------------------------------------------------------------
    // Channel helpers
    // -------------------------------------------------------------------------

    async listen(channelId, callback) {
        later(
            this,
            async () => {
                const channel = this.socket.subscribe(channelId);

                // Track channel
                // Reassigned rather than mutated so the tracked property invalidates.
                this.channels = [...this.channels, channel];

                // Listen to channel for events
                await channel.listener('subscribe').once();

                // Listen for channel subscription
                (async () => {
                    for await (let output of channel) {
                        if (typeof callback === 'function') {
                            callback(output);
                        }
                    }
                })();
            },
            300
        );
    }

    closeChannels() {
        for (let i = 0; i < this.channels.length; i++) {
            const channel = this.channels[i];

            channel.close();
        }
    }
}

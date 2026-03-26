import SimpleAuthSessionService from 'ember-simple-auth/services/session';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { later } from '@ember/runloop';
import { debug } from '@ember/debug';
import getWithDefault from '../utils/get-with-default';

/**
 * SessionService
 *
 * Extends ember-simple-auth's session service to add:
 *
 *   - Proper lifecycle event firing through the EventsService (which
 *     re-broadcasts on both the events bus and the universe bus).
 *   - Session start timestamp tracking for duration calculation.
 *
 * Session lifecycle events fired (via EventsService → universe bus):
 *
 *   session.authenticated   — fired after a successful login/session restore.
 *                             Payload: (properties)
 *
 *   session.invalidated     — fired after the session is destroyed (logout).
 *                             Payload: (duration_seconds, properties)
 *
 *   user.deauthenticated    — alias for session.invalidated, provided as a
 *                             semantic convenience for integrations that want
 *                             to react to the user identity being cleared
 *                             (e.g. Intercom shutdown, PostHog reset).
 *                             Payload: (duration_seconds, properties)
 *
 * All events are fired on both the EventsService Evented bus and the universe
 * service, so listeners can use either:
 *
 *   this.events.on('session.authenticated', handler)
 *   this.universe.on('session.authenticated', handler)   ← recommended for engines
 */
export default class SessionService extends SimpleAuthSessionService {
    @service router;
    @service currentUser;
    @service fetch;
    @service notifications;
    @service events;
    @service universe;

    /**
     * Set where to transition to
     *
     * @var {String}
     */
    @tracked redirectTo = 'console';

    /**
     * If session is onboarding a user.
     *
     * @var {String}
     */
    @tracked _isOnboarding = false;

    /**
     * Timestamp (ms) when the session was authenticated.
     * Used to calculate session duration on invalidation.
     *
     * @var {Number|null}
     */
    @tracked _sessionStartedAt = null;

    /**
     * Set this as onboarding.
     *
     * @return {SessionService}
     */
    isOnboarding() {
        this._isOnboarding = true;

        return this;
    }

    /**
     * Manually authenticate user
     */
    manuallyAuthenticate(authToken) {
        return this.session._setup('authenticator:fleetbase', { token: authToken }, true);
    }

    /**
     * Overwrite the handle authentication method.
     *
     * Fires `session.authenticated` through the events service so that
     * integrations (Intercom, PostHog, etc.) can react to a successful login.
     *
     * @void
     */
    async handleAuthentication() {
        // Record session start time for duration tracking on logout
        this._sessionStartedAt = Date.now();

        // Fire session.authenticated event
        this._fireSessionEvent('session.authenticated');

        if (this._isOnboarding) {
            return;
        }

        const loaderNode = this.showLoader('Starting session...');
        const removeLoaderNode = () => {
            later(
                this,
                () => {
                    // remove node from body
                    document.body.removeChild(loaderNode);
                    this.isLoaderNodeOpen = false;
                },
                600 * 3
            );
        };
        this.isLoaderNodeOpen = true;

        try {
            await this.router.transitionTo(this.redirectTo);
        } catch (error) {
            debug(`Session's handleAuthentication() failed to transition: ${error.message}`);
        }

        removeLoaderNode();
    }

    /**
     * Extends the parent handleInvalidation method.
     *
     * IMPORTANT: super.handleInvalidation(routeAfterInvalidation) is called
     * first to preserve the ember-simple-auth behaviour of redirecting the
     * user to the login page (via handleSessionInvalidated). Our event
     * firing happens after so it cannot interfere with the redirect.
     *
     * @param {String} routeAfterInvalidation - Passed through from ember-simple-auth
     * @void
     */
    handleInvalidation(routeAfterInvalidation) {
        // 1. Always call super first — this performs the actual post-logout
        //    redirect/reload that ember-simple-auth is responsible for.
        super.handleInvalidation(routeAfterInvalidation);

        const durationSeconds = this._sessionStartedAt ? Math.round((Date.now() - this._sessionStartedAt) / 1000) : null;

        // 2. Fire session lifecycle events for integrations (Intercom, PostHog, etc.)
        if (this.events) {
            this.events.trackSessionTerminated(durationSeconds);
        }

        // 3. Fire user.deauthenticated directly on universe for framework-level
        //    uniformity — engines can listen without needing the events service.
        this._fireSessionEvent('user.deauthenticated', { session_duration: durationSeconds });

        // Reset session start time
        this._sessionStartedAt = null;
    }

    /**
     * Loads the current authenticated user
     *
     * @void
     */
    async loadCurrentUser() {
        try {
            const user = await this.currentUser.load();

            if (!user) {
                return this.invalidateWithLoader('Session authentication failed...');
            }

            return user;
        } catch (error) {
            await this.invalidateWithLoader(getWithDefault(error, 'message', 'Session authentication failed...'));
        }
    }

    /**
     * Loads the current authenticated user
     *
     * @param {Transition} transition
     * @void
     */
    async promiseCurrentUser(transition = null) {
        const invalidateWithLoader = this.invalidateWithLoader.bind(this);

        try {
            const user = await this.currentUser.promiseUser();
            if (!user) {
                if (transition) {
                    transition.abort();
                }

                await invalidateWithLoader('Session authentication failed...');
                throw new Error('Session authentication failed...');
            }

            return user;
        } catch (error) {
            if (transition) {
                transition.abort();
            }

            await invalidateWithLoader(error.message ?? 'Session authentication failed...');
            throw error;
        }
    }

    /**
     * Creates an HTML element node for a loading overlay with a message.
     *
     * @param {String} loadingMessage
     * @return {HTMLElement} loader
     */
    showLoader(loadingMessage) {
        const loader = document.createElement('div');
        loader.classList.add('overloader');
        loader.innerHTML = `<div class="flex items-center justify-center">
            <div>
                <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" focusable="false" aria-hidden="true" data-icon="spinner-third" data-prefix="fad" id="ember240" class="svg-inline--fa fa-spinner-third fa-w-16 fa-spin ember-view text-sky-500 fa-spin-800ms mr-3"><g class="fa-group"><path class="fa-secondary" fill="currentColor" d="M478.71 364.58zm-22 6.11l-27.83-15.9a15.92 15.92 0 0 1-6.94-19.2A184 184 0 1 1 256 72c5.89 0 11.71.29 17.46.83-.74-.07-1.48-.15-2.23-.21-8.49-.69-15.23-7.31-15.23-15.83v-32a16 16 0 0 1 15.34-16C266.24 8.46 261.18 8 256 8 119 8 8 119 8 256s111 248 248 248c98 0 182.42-56.95 222.71-139.42-4.13 7.86-14.23 10.55-22 6.11z"></path><path class="fa-primary" fill="currentColor" d="M271.23 72.62c-8.49-.69-15.23-7.31-15.23-15.83V24.73c0-9.11 7.67-16.78 16.77-16.17C401.92 17.18 504 124.67 504 256a246 246 0 0 1-25 108.24c-4 8.17-14.37 11-22.26 6.45l-27.84-15.9c-7.41-4.23-9.83-13.35-6.2-21.07A182.53 182.53 0 0 0 440 256c0-96.49-74.27-175.63-168.77-183.38z"></path></g>
                </svg>
            </div>

            <span class="font-semibold text-gray-700 dark:text-gray-100 test-sm">${loadingMessage}</span>
        </div>`;
        document.body.appendChild(loader);

        return loader;
    }

    /**
     * Invalidates the current session while displaying a loading message on the page.
     *
     * @param {String} loadingMessage
     * @return {Promise}
     */
    invalidateWithLoader(loadingMessage = 'Ending session...') {
        // if loader node is open already just invalidate
        if (this.isLoaderNodeOpen === true) {
            return this.session.invalidate();
        }

        const loaderNode = this.showLoader(loadingMessage);
        this.isLoaderNodeOpen = true;

        return this.session.invalidate().then(() => {
            later(
                this,
                () => {
                    document.body.removeChild(loaderNode);
                    this.isLoaderNodeOpen = false;
                },
                600
            );
        });
    }

    /**
     * Set the redirect route after authentication
     *
     * @void
     */
    setRedirect(whereTo = 'console') {
        this.redirectTo = whereTo;
    }

    /**
     * Get session time expiry date in moment
     *
     * @return {Date}
     */
    getExpiresAtDate() {
        return new Date(this.data.authenticated.expires_at);
    }

    /**
     * Get session time expiry in seconds
     *
     * @return {Integer}
     */
    getSessionSecondsRemaining() {
        const date = this.getExpiresAtDate();
        const now = new Date();

        return Math.round((now - date) / 1000);
    }

    /**
     * Checks for the presence of two-factor authentication for a given user identity.
     *
     * @param {String} identity
     * @return {Promise}
     * @throws {Error}
     */
    checkForTwoFactor(identity) {
        return this.fetch.get('two-fa/check', { identity }).catch((error) => {
            throw new Error(error.message);
        });
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Fires a named session lifecycle event on both the events service and
     * directly on the universe service.
     *
     * Firing on universe directly (in addition to via events service) ensures
     * that all engines and extensions receive the event on the shared framework-
     * level bus regardless of whether the events service has fully initialised.
     *
     * Listeners can subscribe via:
     *   this.universe.on('session.authenticated', handler)
     *   this.universe.on('user.deauthenticated', handler)
     *   this.events.on('session.authenticated', handler)
     *
     * @private
     * @param {String} eventName
     * @param {Object} [extraProps={}]
     */
    _fireSessionEvent(eventName, extraProps = {}) {
        // 1. Fire through the events service (dual-broadcasts on events + universe bus)
        if (this.events) {
            this.events.trackEvent(eventName, extraProps);
        }

        // 2. Also trigger directly on universe for framework-level uniformity —
        //    ensures the event reaches all engines even if events service is
        //    not yet available or not injected in a given engine context.
        if (this.universe) {
            this.universe.trigger(eventName, extraProps);
        }
    }
}

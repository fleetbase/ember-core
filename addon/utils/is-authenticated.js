/**
 * Check whether the current browser session is authenticated.
 *
 * Reads the session payload Ember Simple Auth stores in
 * localStorage (`ember_simple_auth-session`) and returns `true`
 * only if it finds a bearer token.
 *
 * @return {boolean}  `true` when a user appears to be logged in, otherwise `false`.
 */
export default function isAuthenticated() {
    try {
        const rawSession = window.localStorage.getItem('ember_simple_auth-session');
        if (!rawSession) {
            return false; // nothing stored
        }

        const { authenticated } = JSON.parse(rawSession);

        // Basic check: token must be a non-empty string
        return typeof authenticated?.token === 'string' && authenticated.token.trim().length > 0;
    } catch {
        // Malformed JSON or restricted access to localStorage
        return false;
    }
}

import { debug } from '@ember/debug';
import { ACTIVE_COMPANY_CONTEXT_STORAGE_KEY } from '../services/current-user';

/**
 * Validate-company-context instance initializer.
 *
 * On app boot, if a previously-selected company context UUID is persisted in
 * localStorage, validate it with the backend before any business-logic
 * requests go out. A UUID that the backend no longer accepts (401/403) —
 * because the user's membership in that company was revoked, or the company
 * was deleted — must be cleared so subsequent requests fall back to the
 * user's default company via the backend's `Auth::getCompany()` chain.
 *
 * Behaviour:
 *   - No stored UUID → no-op. Backend uses default company on first request.
 *   - Stored UUID + session unauthenticated → no-op. The regular auth flow
 *     will run first; header injection only happens when authenticated
 *     anyway, and a user re-login will re-run initializers.
 *   - Stored UUID + 200 from /v1/companies/current-context → keep.
 *   - Stored UUID + 401/403 → clear localStorage + in-memory tracked state.
 *   - Any other error (network, 5xx) → leave as-is. A real business-logic
 *     request will surface the real error; we don't want transient failures
 *     to silently destroy the user's context selection.
 */
function readStoredContext() {
    try {
        const value = window.localStorage.getItem(ACTIVE_COMPANY_CONTEXT_STORAGE_KEY);
        return typeof value === 'string' && value.length > 0 ? value : null;
    } catch (_e) {
        return null;
    }
}

export async function initialize(appInstance) {
    const stored = readStoredContext();
    if (!stored) {
        return;
    }

    const currentUser = appInstance.lookup('service:current-user');
    const fetch = appInstance.lookup('service:fetch');
    const session = appInstance.lookup('service:session');

    if (!currentUser || !fetch) {
        return;
    }

    // Mirror the stored UUID into the tracked service property so the
    // validation request itself carries `X-Company-Context`.
    currentUser.activeCompanyContext = stored;

    // Only validate when authenticated — an anonymous visitor has no
    // membership to check, and the backend endpoint requires auth.
    if (!session?.isAuthenticated) {
        return;
    }

    try {
        await fetch.get('v1/companies/current-context');
        // 200: keep.
    } catch (err) {
        const status = err?.response?.status ?? err?.status;
        if (status === 401 || status === 403) {
            debug(`[validate-company-context] Clearing revoked company context UUID (status ${status}).`);
            currentUser.activeCompanyContext = null;
        }
        // Other errors: leave untouched. Business-logic requests will surface
        // the real problem; we don't want to clobber a valid selection over a
        // transient network blip.
    }
}

export default {
    name: 'validate-company-context',
    initialize,
};

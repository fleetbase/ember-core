import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { ACTIVE_COMPANY_CONTEXT_STORAGE_KEY } from '@fleetbase/ember-core/services/current-user';

// Minimal session stub — getHeaders() reads session.isAuthenticated and
// session.data.authenticated.{user,token}. We leave the user unauthenticated
// so the auth branches short-circuit and we're only exercising the company
// context branch under test.
class StubSessionService extends Service {
    isAuthenticated = false;
    data = { authenticated: { user: null, token: null } };
}

module('Unit | Service | fetch | X-Company-Context header injection', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:session', StubSessionService);
        // Ensure no stale localStorage bleeds between tests.
        try {
            window.localStorage.removeItem(ACTIVE_COMPANY_CONTEXT_STORAGE_KEY);
        } catch (_e) {
            /* ignore */
        }
    });

    hooks.afterEach(function () {
        try {
            window.localStorage.removeItem(ACTIVE_COMPANY_CONTEXT_STORAGE_KEY);
        } catch (_e) {
            /* ignore */
        }
    });

    test('getHeaders includes X-Company-Context when currentUser.activeCompanyContext is set', function (assert) {
        const currentUser = this.owner.lookup('service:current-user');
        currentUser.activeCompanyContext = 'test-uuid-123';

        const fetchService = this.owner.lookup('service:fetch');
        const headers = fetchService.getHeaders();

        assert.strictEqual(headers['X-Company-Context'], 'test-uuid-123', 'header carries the active context UUID');
    });

    test('getHeaders omits X-Company-Context when no context is set', function (assert) {
        const currentUser = this.owner.lookup('service:current-user');
        currentUser.activeCompanyContext = null;

        const fetchService = this.owner.lookup('service:fetch');
        const headers = fetchService.getHeaders();

        assert.notOk('X-Company-Context' in headers, 'no header when context is null');
    });

    test('header read is reactive — updates when currentUser.activeCompanyContext changes', function (assert) {
        const currentUser = this.owner.lookup('service:current-user');
        const fetchService = this.owner.lookup('service:fetch');

        currentUser.activeCompanyContext = 'uuid-a';
        assert.strictEqual(fetchService.getHeaders()['X-Company-Context'], 'uuid-a', 'first value picked up');

        currentUser.activeCompanyContext = 'uuid-b';
        assert.strictEqual(fetchService.getHeaders()['X-Company-Context'], 'uuid-b', 'subsequent change picked up (no stale caching)');

        currentUser.activeCompanyContext = null;
        assert.notOk('X-Company-Context' in fetchService.getHeaders(), 'clearing removes the header');
    });

    test('activeCompanyContext setter persists to localStorage; clearing removes the key', function (assert) {
        const currentUser = this.owner.lookup('service:current-user');

        currentUser.activeCompanyContext = 'persist-me-uuid';
        assert.strictEqual(
            window.localStorage.getItem(ACTIVE_COMPANY_CONTEXT_STORAGE_KEY),
            'persist-me-uuid',
            'UUID persisted to localStorage on set'
        );

        currentUser.activeCompanyContext = null;
        assert.strictEqual(
            window.localStorage.getItem(ACTIVE_COMPANY_CONTEXT_STORAGE_KEY),
            null,
            'localStorage key removed on clear'
        );

        // Empty/invalid values normalize to null.
        currentUser.activeCompanyContext = '';
        assert.strictEqual(currentUser.activeCompanyContext, null, 'empty string normalizes to null');
    });
});

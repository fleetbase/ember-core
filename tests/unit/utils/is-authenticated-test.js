import isAuthenticated from 'dummy/utils/is-authenticated';
import { module, test } from 'qunit';

const SESSION_KEY = 'ember_simple_auth-session';

module('Unit | Utility | is-authenticated', function (hooks) {
    hooks.afterEach(function () {
        window.localStorage.removeItem(SESSION_KEY);
    });

    test('it returns true when a non-empty bearer token is stored', function (assert) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: 'abc123' } }));

        assert.true(isAuthenticated());
    });

    test('it returns false when nothing is stored', function (assert) {
        window.localStorage.removeItem(SESSION_KEY);

        assert.false(isAuthenticated());
    });

    test('it returns false for blank or missing tokens', function (assert) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: '   ' } }));
        assert.false(isAuthenticated(), 'whitespace-only token');

        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: {} }));
        assert.false(isAuthenticated(), 'missing token');

        window.localStorage.setItem(SESSION_KEY, JSON.stringify({}));
        assert.false(isAuthenticated(), 'missing authenticated section');

        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: { token: 42 } }));
        assert.false(isAuthenticated(), 'non-string token');
    });

    test('it returns false for malformed json', function (assert) {
        window.localStorage.setItem(SESSION_KEY, '{not json');

        assert.false(isAuthenticated());
    });
});

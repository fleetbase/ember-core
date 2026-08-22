import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * UserAdapter adds exactly one thing to ApplicationAdapter: a `me` flag on a
 * queryRecord is turned into the `/me` sub-resource rather than a query
 * parameter, and is removed from the query so it is never also serialized.
 */
module('Unit | Adapter | user', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register(
            'service:session',
            class extends Service {
                data = { authenticated: {} };
                isAuthenticated = false;
            }
        );
        this.owner.register('service:current-user', class extends Service {});

        this.adapter = this.owner.lookup('adapter:user');
    });

    test('it resolves to this addon’s user adapter', function (assert) {
        assert.strictEqual(typeof this.adapter.urlForQueryRecord, 'function');
        assert.strictEqual(this.adapter.pathForType('user'), 'users', 'it inherits the application adapter');
    });

    test('a plain query record uses the collection URL', function (assert) {
        const url = this.adapter.urlForQueryRecord({ public_id: 'user_1' }, 'user');

        assert.true(url.endsWith('/users'), `${url} ends with the collection path`);
    });

    test('the me flag switches to the /me sub-resource', function (assert) {
        const url = this.adapter.urlForQueryRecord({ me: true }, 'user');

        assert.true(url.endsWith('/users/me'), `${url} ends with /users/me`);
    });

    test('the me flag is removed from the query so it is not also sent', function (assert) {
        const query = { me: true };

        this.adapter.urlForQueryRecord(query, 'user');

        assert.notOk('me' in query, 'the flag is consumed rather than serialized');
    });

    test('other query keys are left in place', function (assert) {
        const query = { me: true, include: 'company' };

        this.adapter.urlForQueryRecord(query, 'user');

        assert.deepEqual(query, { include: 'company' });
    });

    test('a falsy me flag is treated as an ordinary query', function (assert) {
        const query = { me: false };

        const url = this.adapter.urlForQueryRecord(query, 'user');

        assert.true(url.endsWith('/users'), `${url} is the collection path`);
        assert.strictEqual(query.me, false, 'a falsy flag is left alone rather than deleted');
    });
});

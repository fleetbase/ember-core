import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * getUserPermissions walks four sources: permissions applied directly to the
 * user, permissions on the user's role, permissions on each of the role's
 * policies, and permissions on policies applied directly to the user.
 *
 * The fixtures below mimic the ember-data shape the service reads — `get` for
 * property access and `toArray` on relationship arrays — without needing real
 * records, which would drag in the whole model graph for what is plain
 * aggregation logic.
 */
function relationship(items) {
    return {
        length: items.length,
        toArray: () => items,
        objectAt: (index) => items[index],
    };
}

function policy(permissions) {
    return {
        get: (key) => (key === 'permissions' ? (permissions ? relationship(permissions) : null) : undefined),
    };
}

function user({ permissions = null, role = null, policies = null } = {}) {
    const values = {
        permissions: permissions ? relationship(permissions) : null,
        role,
        'role.permissions': role?.permissions ? relationship(role.permissions) : null,
        'role.policies': role?.policies ? relationship(role.policies) : null,
        policies: policies ? relationship(policies) : null,
    };

    return { get: (key) => values[key] };
}

module('Unit | Service | current-user (permissions)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:fetch', class extends Service {});
        this.owner.register('service:socket', class extends Service {});
        this.owner.register('service:notifications', class extends Service {});
        this.owner.register('service:theme', class extends Service {});
        this.service = this.owner.lookup('service:current-user');
    });

    test('it collects permissions applied directly to the user', function (assert) {
        const permissions = this.service.getUserPermissions(user({ permissions: ['orders.view'] }));

        assert.deepEqual(permissions, ['orders.view']);
    });

    test('it collects permissions from the role', function (assert) {
        const permissions = this.service.getUserPermissions(user({ role: { permissions: ['orders.edit'] } }));

        assert.deepEqual(permissions, ['orders.edit']);
    });

    test('it collects permissions from every policy on the role', function (assert) {
        const permissions = this.service.getUserPermissions(
            user({
                role: { policies: [policy(['a.view']), policy(['b.view'])] },
            })
        );

        assert.deepEqual(permissions, ['a.view', 'b.view']);
    });

    test('it collects permissions from policies applied directly to the user', function (assert) {
        const permissions = this.service.getUserPermissions(user({ policies: [policy(['c.view'])] }));

        assert.deepEqual(permissions, ['c.view']);
    });

    test('it merges every source together', function (assert) {
        const permissions = this.service.getUserPermissions(
            user({
                permissions: ['direct.view'],
                role: { permissions: ['role.view'], policies: [policy(['role-policy.view'])] },
                policies: [policy(['user-policy.view'])],
            })
        );

        assert.deepEqual(permissions, ['direct.view', 'role.view', 'role-policy.view', 'user-policy.view']);
    });

    test('it returns an empty list for a user with nothing attached', function (assert) {
        assert.deepEqual(this.service.getUserPermissions(user()), []);
    });

    test('it skips a policy that has no permissions', function (assert) {
        const permissions = this.service.getUserPermissions(
            user({
                role: { policies: [policy(null), policy(['kept.view'])] },
                policies: [policy(null)],
            })
        );

        assert.deepEqual(permissions, ['kept.view']);
    });

    test('a role with neither permissions nor policies contributes nothing', function (assert) {
        assert.deepEqual(this.service.getUserPermissions(user({ role: {} })), []);
    });

    test('it keeps duplicates rather than collapsing them', function (assert) {
        const permissions = this.service.getUserPermissions(
            user({
                permissions: ['orders.view'],
                role: { permissions: ['orders.view'] },
            })
        );

        assert.deepEqual(permissions, ['orders.view', 'orders.view'], 'the caller is left to de-duplicate');
    });
});

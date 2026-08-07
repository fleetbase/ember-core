import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import DynamicAbility from 'dummy/abilities/dynamic';

/**
 * The dynamic ability turns a permission string like "fleet-ops create order"
 * into a yes/no, matching the user's granted permissions with support for two
 * shapes of wildcard.
 *
 * Each assertion builds a fresh instance through `factoryFor`, because the
 * ability snapshots the user's permissions in its constructor and `lookup`
 * would hand back the same singleton with a stale snapshot.
 */
module('Unit | Ability | dynamic', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.permissions = [];
        this.isAdmin = false;
        const testContext = this;

        this.owner.register(
            'service:current-user',
            class extends Service {
                get permissions() {
                    return testContext.permissions;
                }
                get isAdmin() {
                    return testContext.isAdmin;
                }
            }
        );

        this.owner.register('ability:fleetbase-dynamic', DynamicAbility);

        this.build = () => this.owner.factoryFor('ability:fleetbase-dynamic').create();

        this.can = (permissionString) => {
            const ability = this.build();
            ability.parseProperty(permissionString);
            return ability.can;
        };
    });

    module('parseProperty', function () {
        test('it splits the permission into its three parts', function (assert) {
            const ability = this.build();

            const property = ability.parseProperty('fleet-ops create order');

            assert.strictEqual(ability.service, 'fleet-ops');
            assert.strictEqual(ability.ability, 'create');
            assert.strictEqual(ability.resource, 'order');
            assert.strictEqual(property, 'can', 'it always resolves to the `can` getter');
        });

        test('the resource is singularized', function (assert) {
            const ability = this.build();

            ability.parseProperty('fleet-ops create orders');

            assert.strictEqual(ability.resource, 'order');
        });

        test('a missing resource leaves it undefined', function (assert) {
            const ability = this.build();

            ability.parseProperty('fleet-ops create');

            assert.strictEqual(ability.resource, undefined);
        });
    });

    module('permission matching', function () {
        test('an exact permission is granted', function (assert) {
            this.permissions = [{ name: 'fleet-ops create order' }];

            assert.true(this.can('fleet-ops create order'));
        });

        test('an unrelated permission is not', function (assert) {
            this.permissions = [{ name: 'fleet-ops create vehicle' }];

            assert.false(this.can('fleet-ops create order'));
        });

        test('no permissions at all denies', function (assert) {
            assert.false(this.can('fleet-ops create order'));
        });

        test('a resource wildcard grants every verb on that resource', function (assert) {
            this.permissions = [{ name: 'fleet-ops * order' }];

            assert.true(this.can('fleet-ops create order'));
            assert.true(this.can('fleet-ops delete order'));
            assert.false(this.can('fleet-ops create vehicle'), 'but only that resource');
        });

        test('a service wildcard grants everything in the service', function (assert) {
            this.permissions = [{ name: 'fleet-ops *' }];

            assert.true(this.can('fleet-ops create order'));
            assert.true(this.can('fleet-ops delete vehicle'));
            assert.false(this.can('storefront create order'), 'but only that service');
        });

        test('the plural form is matched against the singular permission', function (assert) {
            this.permissions = [{ name: 'fleet-ops create order' }];

            assert.true(this.can('fleet-ops create orders'));
        });

        test('an admin is granted everything regardless of permissions', function (assert) {
            this.isAdmin = true;

            assert.true(this.can('anything at all'));
            assert.true(this.can('fleet-ops delete order'));
        });
    });

    module('the permission snapshot', function () {
        test('permissions are read once at construction', function (assert) {
            this.permissions = [{ name: 'fleet-ops create order' }];
            const ability = this.build();

            this.permissions = [];
            ability.parseProperty('fleet-ops create order');

            assert.true(ability.can, 'a later change to the user does not reach an existing ability');
        });

        test('a fresh ability sees the current permissions', function (assert) {
            this.permissions = [];
            assert.false(this.can('fleet-ops create order'));

            this.permissions = [{ name: 'fleet-ops create order' }];
            assert.true(this.can('fleet-ops create order'));
        });
    });
});

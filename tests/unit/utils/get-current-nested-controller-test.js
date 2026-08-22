import getCurrentNestedController from 'dummy/utils/get-current-nested-controller';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Controller from '@ember/controller';

module('Unit | Utility | get-current-nested-controller', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('controller:orders', class extends Controller {});
        this.owner.register('controller:fleet-ops/orders', class extends Controller {});
    });

    test('it looks up the parent controller for a nested route name', function (assert) {
        const controller = getCurrentNestedController(this.owner, 'orders.index');

        assert.true(controller instanceof Controller);
        assert.strictEqual(controller, this.owner.lookup('controller:orders'), 'controllers are singletons');
    });

    test('it strips the engine mount point prefix', function (assert) {
        this.owner.mountPoint = 'console.fleet-ops';

        try {
            const controller = getCurrentNestedController(this.owner, 'console.fleet-ops.orders.index');
            assert.strictEqual(controller, this.owner.lookup('controller:orders'));
        } finally {
            delete this.owner.mountPoint;
        }
    });

    test('it returns null when owner or route name is missing', function (assert) {
        assert.strictEqual(getCurrentNestedController(null, 'orders.index'), null);
        assert.strictEqual(getCurrentNestedController(this.owner, ''), null);
        assert.strictEqual(getCurrentNestedController(this.owner, undefined), null);
    });

    test('it returns null when no matching controller is registered', function (assert) {
        assert.strictEqual(getCurrentNestedController(this.owner, 'does-not-exist.index'), null);
    });

    test('it handles a route name with no dot separator', function (assert) {
        const controller = getCurrentNestedController(this.owner, 'orders');

        assert.strictEqual(controller, this.owner.lookup('controller:orders'), 'the whole name is used as the key');
    });
});

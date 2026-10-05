import pathToRoute from 'dummy/utils/path-to-route';
import { module, test } from 'qunit';

module('Unit | Utility | path-to-route', function () {
    test('it prefixes paths that do not already start with console', function (assert) {
        assert.strictEqual(pathToRoute('orders'), 'console.orders');
        assert.strictEqual(pathToRoute('fleet-ops/orders'), 'console.fleet-ops.orders');
    });

    test('it leaves paths already starting with console unprefixed', function (assert) {
        assert.strictEqual(pathToRoute('console/orders'), 'console.orders');
        assert.strictEqual(pathToRoute('console.orders'), 'console.orders');
    });

    test('it expands the ops segment to operations', function (assert) {
        assert.strictEqual(pathToRoute('fleet-ops/ops/orders'), 'console.fleet-ops.operations.orders');
    });

    test('it defaults to the console route', function (assert) {
        assert.strictEqual(pathToRoute(), 'console.');
        assert.strictEqual(pathToRoute(''), 'console.');
    });
});

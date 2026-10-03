import Registry from '@fleetbase/ember-core/contracts/registry';
import { module, test } from 'qunit';

module('Unit | Contract | registry', function () {
    test('it keeps the name it was constructed with', function (assert) {
        const registry = new Registry('fleet-ops');

        assert.strictEqual(registry.name, 'fleet-ops');
        assert.strictEqual(registry.getOption('name'), 'fleet-ops');
        assert.strictEqual(registry.toString(), 'fleet-ops');
    });

    test('withNamespace appends to the name and returns the registry', function (assert) {
        const registry = new Registry('fleet-ops');

        assert.strictEqual(registry.withNamespace('component'), registry);
        assert.strictEqual(registry.name, 'fleet-ops:component');
        assert.strictEqual(registry.getOption('name'), 'fleet-ops:component', 'the stored option is kept in step');
    });

    test('withSubNamespace appends further', function (assert) {
        const registry = new Registry('fleet-ops').withNamespace('component').withSubNamespace('vehicle:details');

        assert.strictEqual(registry.name, 'fleet-ops:component:vehicle:details');
        assert.strictEqual(registry.toString(), 'fleet-ops:component:vehicle:details');
    });

    test('toObject exposes the current name', function (assert) {
        const registry = new Registry('fleet-ops').withNamespace('component');

        assert.deepEqual(registry.toObject(), { name: 'fleet-ops:component' });
    });

    test('validate rejects a registry without a name', function (assert) {
        assert.throws(() => new Registry().setup(), /Registry requires a name/);
        assert.throws(() => new Registry('').setup(), /Registry requires a name/);
    });

    test('validate accepts a named registry', function (assert) {
        const registry = new Registry('fleet-ops');

        registry.setup();

        assert.strictEqual(registry.name, 'fleet-ops');
    });
});

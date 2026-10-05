import injectEngineService from 'dummy/utils/inject-engine-service';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { setOwner } from '@ember/application';
import Service from '@ember/service';

/**
 * Pulls a service out of a mounted engine and installs it on the target as a
 * fixed property, wiring the engine service's own dependencies from the host
 * owner — engines do not share the host's container, so anything the engine
 * service expects has to be handed to it explicitly.
 */
module('Unit | Utility | inject-engine-service', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.requested = [];
        const testContext = this;

        this.engineService = {};

        this.owner.register(
            'service:universe',
            class extends Service {
                getServiceFromEngine(engineName, serviceName) {
                    testContext.requested.push({ engineName, serviceName });
                    return testContext.engineService;
                }
            }
        );

        this.owner.register('service:store', class extends Service {});
        this.owner.register('service:fetch', class extends Service {});

        this.target = {};
        setOwner(this.target, this.owner);
    });

    module('resolution', function () {
        test('it asks the universe for the named service in the named engine', function (assert) {
            injectEngineService(this.target, 'fleet-ops', 'orders');

            assert.deepEqual(this.requested, [{ engineName: 'fleet-ops', serviceName: 'orders' }]);
        });

        test('it returns the engine service and installs it on the target', function (assert) {
            const service = injectEngineService(this.target, 'fleet-ops', 'orders');

            assert.strictEqual(service, this.engineService);
            assert.strictEqual(this.target.orders, this.engineService);
        });

        test('an explicit key renames the installed property', function (assert) {
            injectEngineService(this.target, 'fleet-ops', 'orders', { key: 'orderService' });

            assert.strictEqual(this.target.orderService, this.engineService);
            assert.strictEqual(this.target.orders, undefined, 'the service name is not used as well');
        });

        test('the installed property is fixed but replaceable by redefinition', function (assert) {
            injectEngineService(this.target, 'fleet-ops', 'orders');

            const descriptor = Object.getOwnPropertyDescriptor(this.target, 'orders');
            assert.false(descriptor.writable, 'it cannot be reassigned');
            assert.true(descriptor.configurable, 'but a later injection can replace it');
            assert.true(descriptor.enumerable);
        });
    });

    module('declared injections', function () {
        test('an array of names is resolved from the host owner', function (assert) {
            injectEngineService(this.target, 'fleet-ops', 'orders', { inject: ['store', 'fetch'] });

            assert.strictEqual(this.engineService.store, this.owner.lookup('service:store'));
            assert.strictEqual(this.engineService.fetch, this.owner.lookup('service:fetch'));
        });

        test('a service already on the target is preferred over a fresh lookup', function (assert) {
            const existing = this.owner.lookup('service:store');
            this.target.store = existing;

            injectEngineService(this.target, 'fleet-ops', 'orders', { inject: ['store'] });

            assert.strictEqual(this.engineService.store, existing);
        });

        test('a non-service property on the target is ignored in favour of a lookup', function (assert) {
            this.target.store = 'not a service';

            injectEngineService(this.target, 'fleet-ops', 'orders', { inject: ['store'] });

            assert.strictEqual(this.engineService.store, this.owner.lookup('service:store'));
        });

        test('an object of injections uses the supplied values', function (assert) {
            const custom = { custom: true };

            injectEngineService(this.target, 'fleet-ops', 'orders', { inject: { store: custom } });

            assert.strictEqual(this.engineService.store, custom);
        });

        test('a null value in the injection object falls back to a lookup', function (assert) {
            injectEngineService(this.target, 'fleet-ops', 'orders', { inject: { store: null } });

            assert.strictEqual(this.engineService.store, this.owner.lookup('service:store'));
        });

        test('an injection list that is neither array nor object injects nothing', function (assert) {
            injectEngineService(this.target, 'fleet-ops', 'orders', { inject: 'store' });

            assert.strictEqual(this.engineService.store, undefined);
        });
    });

    module('automatic resolution', function () {
        test('a property whose value equals its own name is resolved', function (assert) {
            // This is how an engine service declares an unresolved dependency:
            // `store = "store"` until something fills it in.
            this.engineService.store = 'store';

            injectEngineService(this.target, 'fleet-ops', 'orders');

            assert.strictEqual(this.engineService.store, this.owner.lookup('service:store'));
        });

        test('a property whose value differs from its name is left alone', function (assert) {
            this.engineService.store = 'something else';

            injectEngineService(this.target, 'fleet-ops', 'orders');

            assert.strictEqual(this.engineService.store, 'something else');
        });

        test('non-string properties are left alone', function (assert) {
            this.engineService.count = 42;

            injectEngineService(this.target, 'fleet-ops', 'orders');

            assert.strictEqual(this.engineService.count, 42);
        });

        test('automatic resolution is skipped entirely when injections are declared', function (assert) {
            this.engineService.store = 'store';

            injectEngineService(this.target, 'fleet-ops', 'orders', { inject: ['fetch'] });

            assert.strictEqual(this.engineService.store, 'store', 'the unresolved marker survives');
        });
    });
});

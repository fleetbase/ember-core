import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setOwner } from '@ember/application';
import engineService from 'dummy/decorators/engine-service';

/**
 * @engineService installs a service borrowed from a mounted engine as a
 * property on the decorated class, resolving it lazily on first access.
 */
module('Unit | Decorator | engine-service', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.requested = [];
        this.engineService = {};
        const testContext = this;

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

        this.build = (Klass) => {
            const instance = Klass.create ? Klass.create() : new Klass();
            setOwner(instance, this.owner);
            return instance;
        };
    });

    test('it resolves the named service from the named engine', function (assert) {
        class Host extends EmberObject {
            @engineService('fleet-ops') orders;
        }

        const host = this.build(Host);

        assert.strictEqual(host.orders, this.engineService);
        assert.deepEqual(this.requested, [{ engineName: 'fleet-ops', serviceName: 'orders' }]);
    });

    test('resolution is lazy — nothing is asked for until the property is read', function (assert) {
        class Host extends EmberObject {
            @engineService('fleet-ops') orders;
        }

        this.build(Host);

        assert.deepEqual(this.requested, [], 'construction alone resolves nothing');
    });

    test('an initializer takes precedence over the resolved service', function (assert) {
        class Host extends EmberObject {
            @engineService('fleet-ops') orders = 'from initializer';
        }

        const host = this.build(Host);

        assert.strictEqual(host.orders, 'from initializer');
        assert.deepEqual(this.requested, [{ engineName: 'fleet-ops', serviceName: 'orders' }], 'the engine is still consulted first');
    });

    test('declared injections are wired onto the engine service', function (assert) {
        class Host extends EmberObject {
            @engineService('fleet-ops', { inject: ['store'] }) orders;
        }

        const host = this.build(Host);
        host.orders;

        assert.strictEqual(this.engineService.store, this.owner.lookup('service:store'));
    });

    test('the engine name must be a string', function (assert) {
        assert.throws(() => {
            class Host extends EmberObject {
                @engineService(42) orders;
            }
            this.build(Host).orders;
        }, /first argument of the @engineService decorator must be a string/);
    });

    test('the options must be an object', function (assert) {
        assert.throws(() => {
            class Host extends EmberObject {
                @engineService('fleet-ops', 'nope') orders;
            }
            this.build(Host).orders;
        }, /second argument of the @engineService decorator must be an object/);
    });

    test('it requires at least an engine name', function (assert) {
        assert.throws(() => {
            class Host extends EmberObject {
                @engineService orders;
            }
            this.build(Host);
        });
    });
});

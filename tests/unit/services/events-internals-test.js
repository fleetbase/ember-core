import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import config from 'dummy/config/environment';

/**
 * The two private helpers behind every tracker: the dispatcher's debug and
 * no-universe branches, and the model-name resolution chain.
 *
 * `config` is shared across the run, so `config.events` is deleted after each
 * test rather than reassigned.
 */
module('Unit | Service | events (internals)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.originalConsoleLog = console.log;
        this.originalConsoleWarn = console.warn;
        this.logged = [];
        this.warned = [];
        console.log = (...args) => this.logged.push(args);
        console.warn = (...args) => this.warned.push(args);

        this.universeEvents = [];
        const testContext = this;

        this.owner.register(
            'service:universe',
            class extends Service {
                trigger(name, ...args) {
                    testContext.universeEvents.push({ name, args });
                }
            }
        );

        this.owner.register('service:current-user', class extends Service {});

        this.service = this.owner.lookup('service:events');
        this.service.trigger = () => {};
        this.propsOf = (name) => this.universeEvents.find((event) => event.name === name)?.args.at(-1);
    });

    hooks.afterEach(function () {
        if (typeof this.originalConsoleLog === 'function') {
            console.log = this.originalConsoleLog;
        }
        if (typeof this.originalConsoleWarn === 'function') {
            console.warn = this.originalConsoleWarn;
        }
        delete config.events;
    });

    module('debug logging', function () {
        test('nothing is logged by default', function (assert) {
            this.service.trackEvent('custom.event');

            assert.deepEqual(this.logged, []);
        });

        test('the event name and arguments are logged when debug is on', function (assert) {
            config.events = { debug: true };

            this.service.trackEvent('custom.event', { a: 1 });

            assert.strictEqual(this.logged.length, 1);
            assert.strictEqual(this.logged[0][0], '[Events] custom.event');
        });
    });

    module('a missing universe service', function () {
        test('it warns rather than throwing', function (assert) {
            Object.defineProperty(this.service, 'universe', { value: null, configurable: true });

            this.service.trackEvent('custom.event');

            assert.deepEqual(this.warned, [['[Events] Universe service not available']]);
        });

        test('local listeners still receive the event', function (assert) {
            Object.defineProperty(this.service, 'universe', { value: null, configurable: true });
            const local = [];
            this.service.trigger = (name) => local.push(name);

            this.service.trackEvent('custom.event');

            assert.deepEqual(local, ['custom.event'], 'only the cross-engine half is lost');
        });
    });

    module('resolving a model name', function () {
        test('the constructor model name wins', function (assert) {
            this.service.trackBulkAction('delete', [{ constructor: { modelName: 'order' }, _internalModel: { modelName: 'ignored' }, modelName: 'ignored' }]);

            assert.strictEqual(this.propsOf('resource.bulk_action').model_name, 'order');
        });

        test('it falls back to the private internal model', function (assert) {
            this.service.trackBulkAction('delete', [{ _internalModel: { modelName: 'vehicle' } }]);

            assert.strictEqual(this.propsOf('resource.bulk_action').model_name, 'vehicle');
        });

        test('then to a plain modelName property', function (assert) {
            this.service.trackBulkAction('delete', [{ modelName: 'driver' }]);

            assert.strictEqual(this.propsOf('resource.bulk_action').model_name, 'driver');
        });

        test('an object carrying none of them is unknown', function (assert) {
            this.service.trackBulkAction('delete', [{ id: 'x' }]);

            assert.strictEqual(this.propsOf('resource.bulk_action').model_name, 'unknown');
        });
    });
});

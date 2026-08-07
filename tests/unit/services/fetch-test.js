import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

const USER_OPTIONS_KEY = '@fleetbase/storage:user-options';

/**
 * FetchService wraps the API. These tests cover the parts that do not touch
 * the network: header construction, the host/namespace builders, and the
 * payload-to-model normalization.
 */
class OrderConfigModel extends Model {
    @attr('string') name;
}

module('Unit | Service | fetch', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.sessionData = { authenticated: {} };
        this.isAuthenticated = false;
        const testContext = this;

        this.owner.register(
            'service:session',
            class extends Service {
                get data() {
                    return testContext.sessionData;
                }
                get isAuthenticated() {
                    return testContext.isAuthenticated;
                }
            }
        );

        this.owner.register('model:order-config', OrderConfigModel);

        this.service = this.owner.lookup('service:fetch');
        this.store = this.owner.lookup('service:store');
        this.setUserOptions = (options) => window.localStorage.setItem(USER_OPTIONS_KEY, JSON.stringify(options));

        this.authenticate = (user = 'user-1', token = 'abc123') => {
            this.isAuthenticated = true;
            this.sessionData = { authenticated: { user, token } };
        };
    });

    hooks.afterEach(function () {
        window.localStorage.removeItem(USER_OPTIONS_KEY);
    });

    module('headers', function () {
        test('an unauthenticated request sends only a content type', function (assert) {
            assert.deepEqual(this.service.getHeaders(), { 'Content-Type': 'application/json' });
        });

        test('an authenticated request carries a bearer token', function (assert) {
            this.authenticate();

            assert.strictEqual(this.service.getHeaders()['Authorization'], 'Bearer abc123');
        });

        test('sandbox mode adds the sandbox header and key', function (assert) {
            this.authenticate();
            this.setUserOptions({ 'user-1:sandbox': true, 'user-1:test-key': 'key-1' });

            const headers = this.service.getHeaders();

            assert.true(headers['Access-Console-Sandbox']);
            assert.strictEqual(headers['Access-Console-Sandbox-Key'], 'key-1');
        });

        test('sandbox must be exactly true', function (assert) {
            this.authenticate();
            this.setUserOptions({ 'user-1:sandbox': 'yes' });

            assert.strictEqual(this.service.getHeaders()['Access-Console-Sandbox'], undefined);
        });

        test('another user’s options are not applied', function (assert) {
            this.authenticate();
            this.setUserOptions({ 'user-2:sandbox': true });

            assert.strictEqual(this.service.getHeaders()['Access-Console-Sandbox'], undefined);
        });

        test('sandbox headers are withheld while unauthenticated', function (assert) {
            this.sessionData = { authenticated: { user: 'user-1' } };
            this.setUserOptions({ 'user-1:sandbox': true, 'user-1:test-key': 'key-1' });

            const headers = this.service.getHeaders();

            assert.strictEqual(headers['Access-Console-Sandbox'], undefined);
            assert.strictEqual(headers['Access-Console-Sandbox-Key'], undefined);
        });

        test('refreshHeaders picks up a login and returns the service for chaining', function (assert) {
            assert.strictEqual(this.service.headers['Authorization'], undefined);

            this.authenticate();

            assert.strictEqual(this.service.refreshHeaders(), this.service);
            assert.strictEqual(this.service.headers['Authorization'], 'Bearer abc123');
        });
    });

    module('host and namespace', function () {
        test('setNamespace replaces the namespace and chains', function (assert) {
            assert.strictEqual(this.service.setNamespace('int/v2'), this.service);
            assert.strictEqual(this.service.namespace, 'int/v2');
        });

        test('setHost replaces the host and chains', function (assert) {
            assert.strictEqual(this.service.setHost('https://api.example.com'), this.service);
            assert.strictEqual(this.service.host, 'https://api.example.com');
        });

        test('credentials are included by default', function (assert) {
            assert.strictEqual(this.service.credentials, 'include');
        });
    });

    module('jsonToModel', function () {
        test('it pushes attributes into the store as a model', function (assert) {
            const record = this.service.jsonToModel({ uuid: '1', name: 'Standard' }, 'order-config');

            assert.strictEqual(record.constructor.modelName, 'order-config');
            assert.strictEqual(record.name, 'Standard');
        });

        test('it parses a JSON string first', function (assert) {
            const record = this.service.jsonToModel(JSON.stringify({ uuid: '1', name: 'Standard' }), 'order-config');

            assert.strictEqual(record.name, 'Standard');
        });

        test('the model type is dasherized', function (assert) {
            const record = this.service.jsonToModel({ uuid: '1', name: 'Standard' }, 'orderConfig');

            assert.strictEqual(record.constructor.modelName, 'order-config');
        });
    });

    module('normalizeModel', function () {
        test('an array payload becomes an array of models', function (assert) {
            const records = this.service.normalizeModel(
                [
                    { uuid: '1', name: 'A' },
                    { uuid: '2', name: 'B' },
                ],
                'order-config'
            );

            assert.deepEqual(
                records.map((r) => r.name),
                ['A', 'B']
            );
        });

        test('a payload keyed by the pluralized model type is unwrapped', function (assert) {
            const records = this.service.normalizeModel({ order_configs: [{ uuid: '1', name: 'A' }] }, 'orderConfig');

            assert.deepEqual(
                records.map((r) => r.name),
                ['A']
            );
        });

        test('a payload keyed by the model type itself is unwrapped', function (assert) {
            const records = this.service.normalizeModel({ 'order-config': [{ uuid: '1', name: 'A' }] }, 'order-config');

            assert.deepEqual(
                records.map((r) => r.name),
                ['A']
            );
        });

        test('a bare object payload is turned into a single model', function (assert) {
            const record = this.service.normalizeModel({ uuid: '1', name: 'Standard' }, 'order-config');

            assert.strictEqual(record.name, 'Standard');
        });

        test('a wrapped single object is unwrapped', function (assert) {
            const record = this.service.normalizeModel({ 'order-config': { uuid: '1', name: 'Standard' } }, 'order-config');

            assert.strictEqual(record.name, 'Standard');
        });

        test('with no model type it infers one from the first payload key', function (assert) {
            // Regression: this read `Object.keys(payload).firstObject`, which is
            // undefined once prototype extensions are off. The inferred type was
            // therefore never a string and the payload came back unnormalized.
            const records = this.service.normalizeModel({ 'order-config': [{ uuid: '1', name: 'A' }] });

            assert.deepEqual(
                records.map((r) => r.name),
                ['A'],
                'the first key names the model type'
            );
        });

        test('an empty payload is returned as-is', function (assert) {
            const payload = {};

            assert.strictEqual(this.service.normalizeModel(payload), payload, 'there is no key to infer a type from');
        });

        test('a non-string model type is returned unchanged', function (assert) {
            const payload = { anything: true };

            assert.strictEqual(this.service.normalizeModel(payload, 42), payload);
        });
    });

    module('fetchOrderConfigurations', function () {
        test('it normalizes every configuration the API returns', async function (assert) {
            this.service.request = () =>
                Promise.resolve([
                    { uuid: '1', name: 'A' },
                    { uuid: '2', name: 'B' },
                ]);

            // Regression: the response is decoded JSON and the accumulator is a
            // plain array literal, but this used `objectAt` and `pushObject`.
            const configs = await this.service.fetchOrderConfigurations();

            assert.deepEqual(
                configs.map((c) => c.name),
                ['A', 'B']
            );
            assert.strictEqual(configs[0].constructor.modelName, 'order-config');
        });

        test('an empty response yields an empty list', async function (assert) {
            this.service.request = () => Promise.resolve([]);

            assert.deepEqual(await this.service.fetchOrderConfigurations(), []);
        });

        test('the request is addressed to the installed-configs endpoint', async function (assert) {
            const calls = [];
            this.service.request = (path, params) => {
                calls.push({ path, params });
                return Promise.resolve([]);
            };

            await this.service.fetchOrderConfigurations({ limit: 5 });

            assert.deepEqual(calls, [{ path: 'fleet-ops/order-configs/get-installed', params: { limit: 5 } }]);
        });

        test('a failed request rejects', async function (assert) {
            const boom = new Error('offline');
            this.service.request = () => Promise.reject(boom);

            await assert.rejects(this.service.fetchOrderConfigurations(), (error) => error === boom);
        });
    });
});

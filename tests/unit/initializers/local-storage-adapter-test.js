import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Store from '@ember-data/store';
import { initialize } from 'dummy/initializers/local-storage-adapter';

/**
 * This initializer reopens the ember-data Store to add ember-local-storage's
 * import/export helpers. The patch is global and guarded by a flag, because
 * engines boot initializers more than once and `reopen` is not idempotent.
 *
 * Assertions are made against a store *instance* rather than `Store.prototype`:
 * `reopen` applies its mixin lazily, so the members are not visible on the
 * prototype until a store is built.
 *
 * The patch is deliberately not undone in teardown — the real app boot applies
 * it to the same shared Store, so removing it would break whatever runs next.
 */
module('Unit | Initializer | local-storage-adapter', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        initialize();
        this.store = this.owner.lookup('service:store');
    });

    test('a store gains the import and export helpers', function (assert) {
        assert.strictEqual(typeof this.store.importData, 'function');
        assert.strictEqual(typeof this.store.exportData, 'function');
    });

    test('the store is marked as patched', function (assert) {
        assert.true(this.store._emberLocalStoragePatched);
    });

    test('running it again is a no-op', function (assert) {
        const before = this.store.importData;

        initialize();

        assert.strictEqual(this.owner.lookup('service:store').importData, before, 'the guard stops a second reopen');
    });

    test('the helpers take the documented arguments', function (assert) {
        assert.strictEqual(this.store.importData.length, 2, 'json and options');
        assert.strictEqual(this.store.exportData.length, 2, 'types and options');
    });

    test('the patch is applied to the shared Store, not one instance', function (assert) {
        assert.true(this.store instanceof Store, 'the service is a real ember-data Store');
        assert.strictEqual(typeof this.owner.lookup('service:store').importData, 'function');
    });

    /**
     * What the initializer actually contributes is the forwarding: `this` has to
     * arrive as the helper's `store` argument, or ember-local-storage cannot
     * resolve an adapter at all.
     *
     * ember-local-storage drives a private adapter API (`_handleGETRequest`,
     * `_handleStorageRequest`) that the dummy app's ApplicationAdapter does not
     * implement, so `adapterFor` is stubbed with a stand-in that does. That keeps
     * these tests on the forwarding rather than on ember-local-storage's internals,
     * and keeps them off the network.
     */
    module('the helpers the initializer installs', function (nested) {
        nested.beforeEach(function () {
            this.stored = [];
            this.requestedTypes = [];
            this.reloaded = [];
            this.receivers = [];
            const testContext = this;

            this.originalAdapterFor = this.store.adapterFor;
            this.originalFindAll = this.store.findAll;

            this.store.adapterFor = function (type) {
                testContext.receivers.push(this);
                testContext.requestedTypes.push(type);

                return {
                    buildURL: (t) => `/${t}`,
                    _handleGETRequest: () => [{ id: 'widget-1', type: 'widgets', attributes: { name: 'Widget A' } }],
                    _handleStorageRequest: (url, method, options) => {
                        testContext.stored.push({ method, record: options.data.data });
                        return Promise.resolve();
                    },
                };
            };

            this.store.findAll = (type) => {
                testContext.reloaded.push(type);
                return Promise.resolve([]);
            };
        });

        nested.afterEach(function () {
            this.store.adapterFor = this.originalAdapterFor;
            this.store.findAll = this.originalFindAll;
        });

        test('exportData collects the records for the requested types', async function (assert) {
            const json = await this.store.exportData(['widgets']);

            assert.deepEqual(JSON.parse(json).data, [{ id: 'widget-1', type: 'widgets', attributes: { name: 'Widget A' } }]);
        });

        test('exportData resolves the adapter against the store it was called on', async function (assert) {
            await this.store.exportData(['widgets']);

            assert.deepEqual(this.receivers, [this.store], 'the store forwards itself as the helper argument');
            assert.deepEqual(this.requestedTypes, ['widget'], 'and the type is singularized on the way');
        });

        test('exportData can hand back the raw object instead of json', async function (assert) {
            const data = await this.store.exportData([], { json: false });

            assert.deepEqual(data, { data: [] });
        });

        test('importData writes each record through the adapter', async function (assert) {
            const payload = { data: [{ id: 'widget-1', type: 'widgets', attributes: { name: 'Widget A' } }] };

            await this.store.importData(JSON.stringify(payload), { truncate: false });

            assert.deepEqual(this.stored, [{ method: 'POST', record: payload.data[0] }]);
            assert.deepEqual(this.receivers, [this.store]);
        });

        test('importData reloads the types it imported', async function (assert) {
            await this.store.importData('{"data":[{"id":"widget-1","type":"widgets"}]}', { truncate: false });

            assert.deepEqual(this.reloaded, ['widget']);
        });

        test('importData can take an already-parsed payload', async function (assert) {
            await this.store.importData({ data: [{ id: 'widget-1', type: 'widgets' }] }, { json: false, truncate: false });

            assert.strictEqual(this.stored.length, 1, 'the payload was not parsed a second time');
        });
    });
});

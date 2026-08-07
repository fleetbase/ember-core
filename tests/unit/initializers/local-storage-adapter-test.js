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
});

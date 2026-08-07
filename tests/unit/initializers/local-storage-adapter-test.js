import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Store from '@ember-data/store';
import { initialize } from 'dummy/initializers/local-storage-adapter';

/**
 * This initializer reopens the ember-data Store to add ember-local-storage's
 * import/export helpers. The patch is global and guarded by a flag, because
 * engines boot initializers more than once and `reopen` is not idempotent.
 *
 * The patch is deliberately not undone in teardown: it is applied to the shared
 * Store prototype by the real app boot as well, so removing it would break
 * whatever runs next.
 */
module('Unit | Initializer | local-storage-adapter', function (hooks) {
    setupTest(hooks);

    test('it installs the import and export helpers on the store', function (assert) {
        initialize();

        assert.strictEqual(typeof Store.prototype.importData, 'function');
        assert.strictEqual(typeof Store.prototype.exportData, 'function');
    });

    test('it marks the store as patched', function (assert) {
        initialize();

        assert.true(Store.prototype._emberLocalStoragePatched);
    });

    test('a store instance gains the helpers', function (assert) {
        initialize();

        const store = this.owner.lookup('service:store');
        assert.strictEqual(typeof store.importData, 'function');
        assert.strictEqual(typeof store.exportData, 'function');
    });

    test('running it again is a no-op', function (assert) {
        initialize();
        const first = Store.prototype.importData;

        initialize();

        assert.strictEqual(Store.prototype.importData, first, 'the guard stops a second reopen');
        assert.true(Store.prototype._emberLocalStoragePatched);
    });

    test('the helpers take the documented arguments', function (assert) {
        initialize();

        assert.strictEqual(Store.prototype.importData.length, 2, 'json and options');
        assert.strictEqual(Store.prototype.exportData.length, 2, 'types and options');
    });
});

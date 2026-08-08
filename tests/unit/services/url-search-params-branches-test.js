import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';

/**
 * setParam's two encoding paths, the debounced url write, and clear.
 */
module('Unit | Service | url-search-params (branches)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:url-search-params');
        this.service.clear();

        this.originalUrl = window.location.href;
    });

    hooks.afterEach(function () {
        window.history.replaceState({}, '', this.originalUrl);
    });

    module('setParam', function () {
        test('an object value is stored as json', function (assert) {
            this.service.setParam('filter', { status: 'active' });

            assert.strictEqual(this.service.urlParams.get('filter'), '{"status":"active"}');
        });

        test('an array is json too', function (assert) {
            this.service.setParam('ids', ['a', 'b']);

            assert.strictEqual(this.service.urlParams.get('ids'), '["a","b"]');
        });

        test('a string value is percent-encoded', function (assert) {
            this.service.setParam('query', 'a b&c');

            assert.strictEqual(this.service.urlParams.get('query'), 'a%20b%26c');
        });

        test('a number is encoded as its string form', function (assert) {
            this.service.setParam('page', 3);

            assert.strictEqual(this.service.urlParams.get('page'), '3');
        });

        test('it chains', function (assert) {
            assert.strictEqual(this.service.setParam('a', '1').setParam('b', '2'), this.service);
            assert.strictEqual(this.service.urlParams.get('b'), '2');
        });
    });

    module('clear', function () {
        test('it drops every param and chains', function (assert) {
            this.service.setParam('a', '1').setParam('b', '2');

            const returned = this.service.clear();

            assert.strictEqual(returned, this.service);
            assert.strictEqual(this.service.urlParams.get('a'), null);
            assert.strictEqual([...this.service.urlParams.keys()].length, 0);
        });
    });

    module('updateUrlDebounced', function () {
        test('it writes the params to the url once the debounce settles', async function (assert) {
            this.service.setParam('view', 'list');

            this.service.updateUrlDebounced();

            await settled();

            assert.true(window.location.search.includes('view=list'));
        });

        test('repeated calls collapse into one write', async function (assert) {
            this.service.setParam('view', 'list');
            this.service.updateUrlDebounced();
            this.service.setParam('view', 'map');
            this.service.updateUrlDebounced();

            await settled();

            assert.true(window.location.search.includes('view=map'), 'the last value wins');
            assert.false(window.location.search.includes('view=list'));
        });
    });
});

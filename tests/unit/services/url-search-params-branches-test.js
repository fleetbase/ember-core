import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';

/**
 * The mutation half of this service, which used to be entirely inert: the
 * getter built a FRESH URLSearchParams on every access, so every setter mutated
 * a throwaway and clear() assigned to a getter-only property and threw.
 *
 * The params are now cached and rebuilt only when the browser's search string
 * changes underneath them, so writes persist until updateUrl publishes them and
 * reads still pick up a navigation.
 *
 * The URL is set with replaceState and restored afterwards, so nothing here
 * leaks into the rest of the run.
 */
module('Unit | Service | url-search-params (branches)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:url-search-params');
        this.originalUrl = window.location.href;

        this.withSearch = (search) => window.history.replaceState({}, '', `${window.location.pathname}${search}`);
    });

    hooks.afterEach(function () {
        window.history.replaceState({}, '', this.originalUrl);
    });

    module('setParam', function () {
        test('it chains and the value sticks', function (assert) {
            this.withSearch('');

            const returned = this.service.setParam('query', 'widget');

            assert.strictEqual(returned, this.service, 'it chains');
            assert.strictEqual(this.service.getParam('query'), 'widget');
        });

        test('an object value is stored as json and parsed back', function (assert) {
            this.withSearch('');

            this.service.setParam('filter', { status: 'active' });

            assert.deepEqual(this.service.getParam('filter'), { status: 'active' });
        });

        test('an array round-trips the same way', function (assert) {
            this.withSearch('');

            this.service.setParam('ids', ['a', 'b']);

            assert.deepEqual(this.service.getParam('ids'), ['a', 'b']);
        });

        test('a string is percent-encoded on the way in', function (assert) {
            this.withSearch('');

            this.service.setParam('query', 'a b&c');

            assert.strictEqual(this.service.urlParams.get('query'), 'a%20b%26c');
        });

        test('a number is stored as its string form', function (assert) {
            this.withSearch('');

            this.service.setParam('page', 3);

            assert.strictEqual(this.service.urlParams.get('page'), '3');
        });

        test('successive writes accumulate rather than replacing each other', function (assert) {
            this.withSearch('');

            this.service.setParam('a', '1').setParam('b', '2');

            assert.strictEqual(this.service.urlParams.get('a'), '1');
            assert.strictEqual(this.service.urlParams.get('b'), '2');
        });
    });

    module('clear', function () {
        test('it empties the params and chains', function (assert) {
            this.withSearch('?view=list&page=2');

            const returned = this.service.clear();

            assert.strictEqual(returned, this.service);
            assert.strictEqual([...this.service.urlParams.keys()].length, 0);
            assert.strictEqual(this.service.getParam('view'), null);
        });

        test('the cleared state survives until it is published', function (assert) {
            this.withSearch('?view=list');

            this.service.clear();
            this.service.updateUrl();

            assert.strictEqual(window.location.search, '', 'the url is emptied too');
        });
    });

    module('reading, which does work', function () {
        test('getParam reads from the current url', function (assert) {
            this.withSearch('?view=list');

            assert.strictEqual(this.service.getParam('view'), 'list');
        });

        test('a json value is parsed back into an object', function (assert) {
            this.withSearch(`?filter=${encodeURIComponent('{"status":"active"}')}`);

            assert.deepEqual(this.service.getParam('filter'), { status: 'active' });
        });

        test('all() collects every param', function (assert) {
            this.withSearch('?view=list&page=2');

            assert.deepEqual(this.service.all(), { view: 'list', page: '2' });
        });

        test('a param that is not there reads as null', function (assert) {
            this.withSearch('');

            assert.strictEqual(this.service.getParam('missing'), null);
        });
    });

    module('updateUrl', function () {
        test('it publishes a pending write to the url', function (assert) {
            this.withSearch('');

            this.service.setParam('view', 'list');
            this.service.updateUrl();

            assert.true(window.location.search.includes('view=list'));
        });

        test('an unchanged param set writes back what was already there', function (assert) {
            this.withSearch('?view=list');

            this.service.updateUrl();

            assert.true(window.location.search.includes('view=list'), 'nothing is added and nothing is lost');
        });

        test('a navigation underneath the service is picked up on the next read', function (assert) {
            this.withSearch('?view=list');
            assert.strictEqual(this.service.getParam('view'), 'list');

            this.withSearch('?view=map');

            assert.strictEqual(this.service.getParam('view'), 'map', 'the cache rebuilt from the new url');
        });

        test('the debounced form publishes once it settles', async function (assert) {
            this.withSearch('');

            this.service.setParam('view', 'map');
            this.service.updateUrlDebounced();
            await settled();

            assert.true(window.location.search.includes('view=map'));
        });
    });
});

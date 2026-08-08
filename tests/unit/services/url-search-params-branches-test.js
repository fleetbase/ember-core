import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';

/**
 * The whole mutation half of this service is inert, and these tests pin that
 * rather than the behaviour the method names promise.
 *
 *   get urlParams() {
 *       return new URLSearchParams(window.location.search);
 *   }
 *
 * The getter builds a FRESH URLSearchParams on every access, so
 * `this.urlParams.set(...)` in setParam mutates a throwaway object that is
 * discarded the moment the method returns. removeParam and addParam have the
 * same shape. clear() goes further and assigns to the getter, which throws.
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
        test('it chains, but stores nothing', function (assert) {
            this.withSearch('');

            const returned = this.service.setParam('query', 'widget');

            assert.strictEqual(returned, this.service, 'it chains like a working setter');
            assert.strictEqual(this.service.getParam('query'), null, 'and the value is gone the moment it returns');
        });

        test('an object value takes the json path and is still discarded', function (assert) {
            this.withSearch('');

            this.service.setParam('filter', { status: 'active' });

            assert.strictEqual(this.service.getParam('filter'), null);
        });

        test('an array takes the same path', function (assert) {
            this.withSearch('');

            this.service.setParam('ids', ['a', 'b']);

            assert.strictEqual(this.service.getParam('ids'), null);
        });

        test('a string takes the percent-encoding path', function (assert) {
            this.withSearch('');

            this.service.setParam('query', 'a b&c');

            assert.strictEqual(this.service.getParam('query'), null);
        });

        test('a number takes it too', function (assert) {
            this.withSearch('');

            this.service.setParam('page', 3);

            assert.strictEqual(this.service.getParam('page'), null);
        });
    });

    module('clear', function () {
        test('it throws, because urlParams has only a getter', function (assert) {
            this.withSearch('?view=list');

            assert.throws(() => this.service.clear(), /only a getter|has only a getter|Cannot set property/);
            assert.strictEqual(this.service.getParam('view'), 'list', 'and the params are untouched');
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
        test('it writes back exactly what is already in the url', function (assert) {
            this.withSearch('?view=list');

            this.service.updateUrl();

            assert.true(window.location.search.includes('view=list'), 'nothing is added and nothing is lost');
        });

        test('the debounced form does the same once it settles', async function (assert) {
            this.withSearch('?view=map');

            this.service.updateUrlDebounced();
            await settled();

            assert.true(window.location.search.includes('view=map'));
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

/**
 * `urlParams` used to be a getter that built a NEW URLSearchParams from
 * window.location.search on every access, so every mutator wrote to a throwaway
 * and `clear()` threw by assigning to a getter-only property.
 *
 * The storage model chosen is a cached instance that is rebuilt whenever the
 * browser's search string differs from the one it was built from: writes persist
 * until `updateUrl` publishes them, and a navigation underneath the service is
 * still picked up on the next read.
 */
module('Unit | Service | url-search-params', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:url-search-params');
        this.originalUrl = window.location.href;
    });

    hooks.afterEach(function () {
        window.history.replaceState({}, '', this.originalUrl);
    });

    function setSearch(search) {
        window.history.replaceState({}, '', `${window.location.pathname}${search}`);
    }

    test('it reads a plain parameter from the current url', function (assert) {
        setSearch('?status=active');

        assert.strictEqual(this.service.getParam('status'), 'active');
        assert.strictEqual(this.service.get('status'), 'active', 'get is an alias for getParam');
    });

    test('it parses a json parameter into an object or array', function (assert) {
        setSearch(`?filters=${encodeURIComponent('{"a":1}')}&ids=${encodeURIComponent('[1,2]')}`);

        assert.deepEqual(this.service.getParam('filters'), { a: 1 });
        assert.deepEqual(this.service.getParam('ids'), [1, 2]);
    });

    test('it returns null for a missing parameter', function (assert) {
        setSearch('?status=active');

        assert.strictEqual(this.service.getParam('nope'), null);
    });

    test('it reads repeated parameters as an array', function (assert) {
        setSearch('?tag=a&tag=b');

        assert.deepEqual(this.service.getParamArray('tag'), ['a', 'b']);
        assert.deepEqual(this.service.getParamArray('missing'), []);
    });

    test('exists and has report presence', function (assert) {
        setSearch('?status=active');

        assert.true(this.service.exists('status'));
        assert.true(this.service.has('status'));
        assert.false(this.service.exists('missing'));
        assert.false(this.service.has('missing'));
    });

    test('all returns every parameter, parsing json values', function (assert) {
        setSearch(`?status=active&filters=${encodeURIComponent('{"a":1}')}`);

        assert.deepEqual(this.service.all(), { status: 'active', filters: { a: 1 } });
    });

    test('all is empty when the url has no query string', function (assert) {
        setSearch('');

        assert.deepEqual(this.service.all(), {});
    });

    test('setParam stores the value and chains', function (assert) {
        setSearch('?status=active');

        assert.strictEqual(this.service.setParam('page', '2'), this.service, 'it returns the service for chaining');
        assert.strictEqual(this.service.getParam('page'), '2', 'and the write is kept');
        assert.strictEqual(window.location.search, '?status=active', 'the url is not touched until updateUrl');
    });

    test('setParamArray and remove both take effect', function (assert) {
        setSearch('?tag=a');

        this.service.setParamArray('tag', ['x', 'y']);
        assert.deepEqual(this.service.getParamArray('tag'), ['x', 'y']);

        this.service.remove('tag');
        assert.deepEqual(this.service.getParamArray('tag'), []);
    });

    test('clear empties the parameters', function (assert) {
        setSearch('?status=active&tag=a');

        assert.strictEqual(this.service.clear(), this.service, 'it chains');
        assert.deepEqual(this.service.all(), {});
    });

    test('getFullUrl and getPathWithParams reflect the unchanged url', function (assert) {
        setSearch('?status=active');

        assert.true(this.service.getFullUrl().includes('status=active'));
        assert.strictEqual(this.service.getPathWithParams(), `${window.location.pathname}?status=active`);
    });

    test('updateUrl rewrites the url with the current parameters', function (assert) {
        setSearch('?status=active');

        this.service.updateUrl();

        assert.strictEqual(window.location.search, '?status=active');
    });

    test('addParamToCurrentUrl actually changes the url', function (assert) {
        setSearch('?status=active');

        this.service.addParamToCurrentUrl('page', '2');

        assert.strictEqual(this.service.getParam('page'), '2');
        assert.strictEqual(this.service.getParam('status'), 'active', 'existing parameters are preserved');
    });

    test('addParamToCurrentUrl overwrites an existing value', function (assert) {
        setSearch('?page=1');

        this.service.addParamToCurrentUrl('page', '5');

        assert.strictEqual(this.service.getParam('page'), '5');
    });

    test('removeParamFromCurrentUrl actually removes the parameter', function (assert) {
        setSearch('?status=active&page=2');

        this.service.removeParamFromCurrentUrl('page');

        assert.strictEqual(this.service.getParam('page'), null);
        assert.strictEqual(this.service.getParam('status'), 'active');
    });

    test('setParamsToCurrentUrl applies every entry of an object', function (assert) {
        setSearch('');

        this.service.setParamsToCurrentUrl({ status: 'active', page: '3' });

        assert.strictEqual(this.service.getParam('status'), 'active');
        assert.strictEqual(this.service.getParam('page'), '3');
    });

    test('setParamsToCurrentUrl with no argument leaves the url alone', function (assert) {
        setSearch('?status=active');

        this.service.setParamsToCurrentUrl();

        assert.strictEqual(window.location.search, '?status=active');
    });
});

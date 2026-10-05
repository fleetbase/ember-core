import consoleUrl, { queryString, extractHostAndPort } from '@fleetbase/ember-core/utils/console-url';
import { module, test } from 'qunit';

module('Unit | Utility | console-url', function () {
    module('queryString', function () {
        test('it encodes keys and values', function (assert) {
            assert.strictEqual(queryString({ a: 1, b: 'two' }), 'a=1&b=two');
            assert.strictEqual(queryString({ 'a key': 'a value' }), 'a%20key=a%20value');
            assert.strictEqual(queryString({ q: 'a&b=c' }), 'q=a%26b%3Dc');
        });

        test('it returns an empty string for no params', function (assert) {
            assert.strictEqual(queryString({}), '');
        });
    });

    module('extractHostAndPort', function () {
        test('it splits a url into host and port', function (assert) {
            assert.deepEqual(extractHostAndPort('https://example.com:8080/path'), { host: 'example.com', port: '8080' });
        });

        test('it reports an empty port when the url has none', function (assert) {
            assert.deepEqual(extractHostAndPort('https://example.com'), { host: 'example.com', port: '' });
        });

        test('it returns nulls for an unparseable url', function (assert) {
            assert.deepEqual(extractHostAndPort('not a url'), { host: null, port: null });
            assert.deepEqual(extractHostAndPort(undefined), { host: null, port: null });
        });
    });

    module('consoleUrl', function () {
        test('it builds a url against an explicit host', function (assert) {
            assert.strictEqual(consoleUrl('orders', {}, 'app', 'https://fleetbase.io'), 'https://app.fleetbase.io/orders');
        });

        test('it prefixes a path that does not start with a slash', function (assert) {
            assert.strictEqual(consoleUrl('/orders', {}, 'app', 'https://fleetbase.io'), 'https://app.fleetbase.io/orders');
        });

        test('it appends query parameters', function (assert) {
            assert.strictEqual(consoleUrl('orders', { page: 2 }, 'app', 'https://fleetbase.io'), 'https://app.fleetbase.io/orders?page=2');
        });

        test('it preserves an explicit port', function (assert) {
            assert.strictEqual(consoleUrl('orders', {}, 'app', 'https://fleetbase.io:4200'), 'https://app.fleetbase.io:4200/orders');
        });

        test('it omits the subdomain segment when there is none', function (assert) {
            assert.strictEqual(consoleUrl('orders', {}, '', 'https://fleetbase.io'), 'https://fleetbase.io/orders');
        });

        test('it falls back to the current location when host and subdomain are omitted', function (assert) {
            const url = consoleUrl('orders');

            assert.true(url.includes(window.location.hostname), `${url} is built from the current host`);
            assert.true(url.endsWith('/orders'));
        });

        test('it defaults to an empty path', function (assert) {
            assert.strictEqual(consoleUrl(undefined, {}, 'app', 'https://fleetbase.io'), 'https://app.fleetbase.io/');
        });
    });
});

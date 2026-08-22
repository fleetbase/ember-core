import consoleUrl, { extractHostAndPort } from 'dummy/utils/console-url';
import { module, test } from 'qunit';

/**
 * consoleUrl derives the subdomain and host from window.location unless it is
 * told them. The existing test covers the derived path; these cover being told,
 * and the shape of the string it assembles.
 */
module('Unit | Utility | console-url (branches)', function () {
    test('an explicit subdomain and host skip the window.location lookup entirely', function (assert) {
        const url = consoleUrl('/orders', {}, 'fleet', 'https://example.com');

        assert.true(url.endsWith('example.com/orders'));
        assert.true(url.includes('fleet.'), 'the subdomain is prefixed');
    });

    test('a port on the host is carried into the url', function (assert) {
        const url = consoleUrl('/orders', {}, 'fleet', 'https://example.com:8080');

        assert.true(url.includes('example.com:8080/orders'));
    });

    test('a host with no port gets no port segment', function (assert) {
        assert.false(consoleUrl('/orders', {}, 'fleet', 'https://example.com').includes(':8080'));
    });

    test('an explicit host with no subdomain still derives the subdomain', function (assert) {
        const url = consoleUrl('/orders', {}, null, 'https://example.com');

        assert.true(url.includes('example.com/orders'), 'the host given is used');
    });

    test('a path without a leading slash gets one', function (assert) {
        assert.strictEqual(consoleUrl('orders', {}, 'fleet', 'https://example.com'), consoleUrl('/orders', {}, 'fleet', 'https://example.com'));
    });

    test('an empty path still produces a trailing slash', function (assert) {
        assert.true(consoleUrl('', {}, 'fleet', 'https://example.com').endsWith('/'));
    });

    test('query params are appended, and omitted when there are none', function (assert) {
        assert.true(consoleUrl('/orders', { view: 'list' }, 'fleet', 'https://example.com').endsWith('/orders?view=list'));
        assert.false(consoleUrl('/orders', {}, 'fleet', 'https://example.com').includes('?'));
    });

    test('a subdomain of null produces no prefix', function (assert) {
        // Reached by handing an explicit host so the derivation block is skipped
        // while subdomain stays null.
        const url = consoleUrl('/orders', {}, null, 'https://example.com');

        assert.false(url.includes('null.'), 'a null subdomain is not interpolated');
    });

    module('extractHostAndPort', function () {
        test('it splits a url into host and port', function (assert) {
            assert.deepEqual(extractHostAndPort('https://example.com:8080/path'), { host: 'example.com', port: '8080' });
        });

        test('a url with no port reports an empty port, never the declared null default', function (assert) {
            // The destructuring writes `port = null`, but URL always defines
            // `port` as a string — '' when absent — so the default can never
            // apply. Harmless, but it means `port` is falsy rather than null.
            assert.deepEqual(extractHostAndPort('https://example.com/path'), { host: 'example.com', port: '' });
        });

        test('something that is not a url yields nulls', function (assert) {
            assert.deepEqual(extractHostAndPort('not a url'), { host: null, port: null });
        });
    });

    test('an explicit subdomain with no host derives only the host', function (assert) {
        const url = consoleUrl('/orders', {}, 'fleet', null);

        assert.true(url.includes('fleet.'), 'the subdomain given is kept');
        assert.true(url.includes(window.location.hostname), 'and the host comes from window.location');
    });

    test('blank query params produce no query string', function (assert) {
        // `{}` is not blank, so null is the only way into the empty arm.
        assert.false(consoleUrl('/orders', null, 'fleet', 'https://example.com').includes('?'));
    });
});

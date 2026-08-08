import { module, test } from 'qunit';
import { settled } from '@ember/test-helpers';
import download from 'dummy/utils/download';

/**
 * The vendored downloadjs helper, recorded for most of this campaign as
 * untestable because "it triggers real downloads/XHR". Both are interceptable:
 *
 *  - the anchor it clicks comes from `document.createElement('a')`, so wrapping
 *    createElement for the duration lets the click be a no-op — nothing is
 *    actually saved;
 *  - the url-only path builds an `XMLHttpRequest` off the global, the same seam
 *    the corslite tests use.
 *
 * Its scheduling goes through Ember's `later`, so `settled()` flushes it.
 */
module('Unit | Utility | download', function (hooks) {
    hooks.beforeEach(function () {
        this.clicks = [];
        this.anchors = [];
        this.originalCreateElement = document.createElement.bind(document);

        document.createElement = (tagName, ...rest) => {
            const element = this.originalCreateElement(tagName, ...rest);

            if (tagName === 'a') {
                this.anchors.push(element);
                element.click = () => this.clicks.push(element.getAttribute('download') ?? element.href);
            }

            return element;
        };
    });

    hooks.afterEach(async function () {
        await settled();
        document.createElement = this.originalCreateElement;
        document.querySelectorAll('.download-js-link, iframe[src^="blob:"], iframe[src^="data:"]').forEach((node) => node.remove());
    });

    module('a blob with a name and type', function () {
        test('it reports success', function (assert) {
            assert.true(download(new Blob(['a,b\n1,2'], { type: 'text/csv' }), 'orders.csv', 'text/csv'));
        });

        test('it builds an anchor carrying the filename', async function (assert) {
            download(new Blob(['a,b'], { type: 'text/csv' }), 'orders.csv', 'text/csv');

            const anchor = this.anchors.at(-1);
            assert.strictEqual(anchor.getAttribute('download'), 'orders.csv');
            assert.strictEqual(anchor.className, 'download-js-link');
            assert.true(anchor.href.startsWith('blob:'), 'pointed at an object url');
        });

        test('the anchor is clicked and cleaned up', async function (assert) {
            download(new Blob(['a,b'], { type: 'text/csv' }), 'orders.csv', 'text/csv');
            const anchor = this.anchors.at(-1);
            assert.strictEqual(anchor.parentNode, document.body, 'attached while it works');

            await settled();

            assert.deepEqual(this.clicks, ['orders.csv']);
            assert.strictEqual(anchor.parentNode, null, 'and detached afterwards');
        });

        test('a missing filename falls back to "download"', async function (assert) {
            download(new Blob(['a']), undefined, 'text/plain');

            assert.strictEqual(this.anchors.at(-1).getAttribute('download'), 'download');
        });
    });

    module('a plain string payload', function () {
        test('it is wrapped in a blob and downloaded', async function (assert) {
            assert.true(download('hello', 'greeting.txt', 'text/plain'));
            assert.strictEqual(this.anchors.at(-1).getAttribute('download'), 'greeting.txt');
        });

        test('a string with high bytes is converted through a typed array', async function (assert) {
            // The \x80-\xff branch: characters outside ASCII are copied
            // charCode-by-charCode into a Uint8Array before being blobbed.
            assert.true(download('caf\xe9', 'cafe.txt', 'text/plain'));
            assert.strictEqual(this.anchors.at(-1).getAttribute('download'), 'cafe.txt');
        });
    });

    module('a data url payload', function () {
        test('it is saved without being re-encoded', async function (assert) {
            assert.true(download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));

            assert.strictEqual(this.anchors.at(-1).getAttribute('download'), 'hello.txt');
        });

        test('the anchor points at the data url itself', async function (assert) {
            download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain');

            assert.true(this.anchors.at(-1).href.startsWith('data:'), 'not an object url');
        });
    });

    module('a url as the only argument', function (hooks) {
        hooks.beforeEach(function () {
            this.originalXhr = window.XMLHttpRequest;
            const testContext = this;

            window.XMLHttpRequest = class {
                open(method, url) {
                    testContext.opened = { method, url };
                }
                send() {
                    testContext.sent = true;
                }
            };
        });

        hooks.afterEach(function () {
            if (typeof this.originalXhr === 'function') {
                window.XMLHttpRequest = this.originalXhr;
            }
        });

        test('it fetches the url as a blob rather than downloading a string', async function (assert) {
            const request = download('https://example.com/files/report.csv');

            assert.strictEqual(request.responseType, 'blob');
            assert.deepEqual(this.opened, { method: 'GET', url: 'https://example.com/files/report.csv' });
        });

        test('the request is sent on the next turn, so headers can still be set', async function (assert) {
            download('https://example.com/files/report.csv');

            assert.notOk(this.sent, 'not sent synchronously');

            await settled();

            assert.true(this.sent);
        });

        test('the filename is derived from the url, without its query', async function (assert) {
            const request = download('https://example.com/files/report.csv?token=abc');
            request.onload({ target: { response: new Blob(['a']) } });

            assert.strictEqual(this.anchors.at(-1).getAttribute('download'), 'report.csv');
        });
    });

    module('called as a bound callback', function () {
        test('binding true reverses the payload and mime arguments', async function (assert) {
            // download.bind(true, 'text/xml', 'export.xml') is a documented usage
            // of the original library; `String(this) === 'true'` is what detects it.
            const bound = download.bind(true);

            assert.true(bound('<x/>', 'export.xml', 'text/xml'));
        });
    });

    module('an IE10 style client', function () {
        test('msSaveBlob is preferred when it exists', function (assert) {
            const saved = [];
            Object.defineProperty(navigator, 'msSaveBlob', {
                value: (blob, name) => {
                    saved.push(name);
                    return true;
                },
                configurable: true,
            });

            try {
                assert.true(download(new Blob(['a']), 'orders.csv', 'text/csv'));
                assert.deepEqual(saved, ['orders.csv']);
                assert.deepEqual(this.clicks, [], 'no anchor is clicked');
            } finally {
                delete navigator.msSaveBlob;
            }
        });
    });
});

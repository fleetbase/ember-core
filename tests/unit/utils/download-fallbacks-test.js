import { module, test } from 'qunit';
import { settled } from '@ember/test-helpers';
import download from 'dummy/utils/download';

/**
 * The fallback paths downloadjs keeps for browsers Chrome is not: the Safari
 * window.open route, the old iframe route, and the no-URL route that base64s or
 * FileReads the payload.
 *
 * Each is chosen by a CAPABILITY check, so each is reached by removing the
 * capability rather than by faking the outcome:
 *
 *   `'download' in anchor`   — return a <span> from createElement instead of an
 *                              <a>; it has no `download` property, but still
 *                              appends, takes attributes and has click().
 *   Safari user agent        — defineProperty on navigator.userAgent.
 *   `self.URL`               — delete window.URL for the duration.
 *
 * Nothing here can navigate: window.open is stubbed, and the one path that would
 * set location.href is behind a confirm() that is stubbed to decline.
 */
module('Unit | Utility | download (browser fallbacks)', function (hooks) {
    hooks.beforeEach(function () {
        this.originalCreateElement = document.createElement.bind(document);
        this.originalUserAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent') ?? Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
        this.originalOpen = window.open;
        this.originalConfirm = window.confirm;
        this.originalUrl = window.URL;

        this.opened = [];
        this.confirmed = 0;
        this.iframes = [];
        this.anchorless = false;

        window.open = (url) => {
            this.opened.push(url);
            return this.popupBlocked ? null : { closed: false };
        };
        window.confirm = () => {
            this.confirmed += 1;
            return false; // never let the location.href branch run
        };

        document.createElement = (tagName, ...rest) => {
            // A <span> stands in for the anchor when the test wants a browser
            // without a[download]; everything downloadjs does to it works.
            if (tagName === 'a' && this.anchorless) {
                return this.originalCreateElement('span');
            }

            const element = this.originalCreateElement(tagName, ...rest);

            if (tagName === 'a') {
                element.click = () => {};
            }
            if (tagName === 'iframe') {
                this.iframes.push(element);
            }

            return element;
        };

        this.useSafariUserAgent = () => {
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
                configurable: true,
            });
        };
    });

    hooks.afterEach(async function () {
        await settled();
        document.createElement = this.originalCreateElement;
        window.open = this.originalOpen;
        window.confirm = this.originalConfirm;
        if (this.originalUrl !== undefined) {
            window.URL = this.originalUrl;
        }
        if (this.originalUserAgent) {
            Object.defineProperty(window.navigator, 'userAgent', this.originalUserAgent);
        }
        document.querySelectorAll('.download-js-link, iframe').forEach((node) => node.remove());
    });

    module('a browser without a[download]', function (hooks) {
        hooks.beforeEach(function () {
            this.anchorless = true;
        });

        test('safari is sent through window.open', function (assert) {
            this.useSafariUserAgent();

            assert.true(download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));
            assert.strictEqual(this.opened.length, 1, 'the document is opened rather than saved');
        });

        test('a data url is given a downloading mime type first', function (assert) {
            this.useSafariUserAgent();

            download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain');

            assert.true(this.opened[0].startsWith('data:application/octet-stream'), 'so safari offers to save rather than render it');
        });

        test('a blocked popup offers a manual save instead', function (assert) {
            this.useSafariUserAgent();
            this.popupBlocked = true;

            assert.true(download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));
            assert.strictEqual(this.confirmed, 1, 'the user is asked');
        });

        test('a non-safari browser falls back to an iframe', async function (assert) {
            download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain');

            const iframe = this.iframes.at(-1);
            assert.ok(iframe, 'an iframe was created');
            assert.true(iframe.src.startsWith('data:application/octet-stream'), 'with a mime that downloads');
        });

        test('the iframe is cleaned up afterwards', async function (assert) {
            download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain');
            const iframe = this.iframes.at(-1);
            assert.strictEqual(iframe.parentNode, document.body);

            await settled();

            assert.strictEqual(iframe.parentNode, null);
        });
    });

    module('a browser without URL.createObjectURL', function () {
        test('a blob is read and saved as a data url', async function (assert) {
            delete window.URL;

            assert.true(download(new Blob(['hello']), 'hello.txt', 'text/plain'));

            await settled();

            assert.strictEqual(this.iframes.length, 0, 'the anchor path still applies once the reader resolves');
        });

        test('a string payload is base64 encoded directly', function (assert) {
            delete window.URL;

            // A string blob-alike skips FileReader entirely and goes through btoa.
            assert.true(download('hello', 'hello.txt', 'text/plain'));
        });
    });

    module('a data url larger than two megabytes', function () {
        test('it is decoded into a blob rather than passed through', function (assert) {
            // Under the threshold downloadjs hands the data url straight to the
            // saver; over it, the url is decoded so the browser is not asked to
            // parse a huge string.
            const payload = 'data:text/plain;base64,' + 'a'.repeat(2 * 1024 * 1024);

            assert.true(download(payload, 'big.txt', 'text/plain'));
        });

        test('a url-encoded payload takes the decodeURIComponent branch', function (assert) {
            const payload = 'data:text/plain,' + 'a'.repeat(2 * 1024 * 1024);

            assert.true(download(payload, 'big.txt', 'text/plain'));
        });
    });
});

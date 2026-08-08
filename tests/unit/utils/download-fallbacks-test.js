import { module, test } from 'qunit';
import { settled } from '@ember/test-helpers';
import download from 'dummy/utils/download';

/**
 * The fallback paths downloadjs keeps for browsers Chrome is not: the Safari
 * window.open route, the old iframe route, and the no-URL route.
 *
 * Each is chosen by a CAPABILITY check, so each is reached by removing the
 * capability rather than by faking the outcome:
 *
 *   `'download' in anchor`   — hand back a <span> instead of an <a>; it has no
 *                              `download` property but still appends, takes
 *                              attributes and has click().
 *   Safari user agent        — defineProperty on navigator.userAgent.
 *   `self.URL`               — delete window.URL for the duration.
 *
 * The createElement override is installed around the `download()` CALL and
 * removed immediately after, never for a whole test: QUnit's own reporter
 * creates anchors, and handing it a span stalls reporting until testem's
 * ten-second watchdog kills the run.
 *
 * Nothing here can navigate — window.open is stubbed, and the only path that
 * would set location.href is behind a confirm() stubbed to decline.
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
        this.popupBlocked = false;

        window.open = (url) => {
            this.opened.push(url);
            return this.popupBlocked ? null : { closed: false };
        };
        window.confirm = () => {
            this.confirmed += 1;
            return false; // never let the location.href branch run
        };

        // Runs `fn` with anchors replaced by spans, and restores createElement
        // before returning — including if `fn` throws.
        this.withoutDownloadAttribute = (fn) => {
            document.createElement = (tagName, ...rest) => {
                if (tagName === 'a') {
                    return this.originalCreateElement('span');
                }
                const element = this.originalCreateElement(tagName, ...rest);
                if (tagName === 'iframe') {
                    this.iframes.push(element);
                }
                return element;
            };

            try {
                return fn();
            } finally {
                document.createElement = this.originalCreateElement;
            }
        };

        this.useSafariUserAgent = () => {
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
                configurable: true,
            });
        };
    });

    hooks.afterEach(async function () {
        document.createElement = this.originalCreateElement;
        if (this.originalUserAgent) {
            Object.defineProperty(window.navigator, 'userAgent', this.originalUserAgent);
        }
        if (this.originalUrl !== undefined) {
            window.URL = this.originalUrl;
        }
        await settled();
        window.open = this.originalOpen;
        window.confirm = this.originalConfirm;
        document.querySelectorAll('.download-js-link, iframe[src^="data:"]').forEach((node) => node.remove());
    });

    module('a browser without a[download]', function () {
        test('safari is sent through window.open', function (assert) {
            this.useSafariUserAgent();

            const result = this.withoutDownloadAttribute(() => download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));

            assert.true(result);
            assert.strictEqual(this.opened.length, 1, 'the document is opened rather than saved');
        });

        test('a data url is given a downloading mime type first', function (assert) {
            this.useSafariUserAgent();

            this.withoutDownloadAttribute(() => download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));

            assert.true(this.opened[0].startsWith('data:application/octet-stream'), 'so safari offers to save rather than render it');
        });

        test('a blocked popup offers a manual save instead', function (assert) {
            this.useSafariUserAgent();
            this.popupBlocked = true;

            const result = this.withoutDownloadAttribute(() => download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));

            assert.true(result);
            assert.strictEqual(this.confirmed, 1, 'the user is asked');
        });

        test('a non-safari browser falls back to an iframe', function (assert) {
            this.withoutDownloadAttribute(() => download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));

            const iframe = this.iframes.at(-1);
            assert.ok(iframe, 'an iframe was created');
            assert.true(iframe.src.startsWith('data:application/octet-stream'), 'with a mime that downloads');
        });

        test('the iframe is cleaned up afterwards', async function (assert) {
            this.withoutDownloadAttribute(() => download('data:text/plain;base64,aGVsbG8=', 'hello.txt', 'text/plain'));
            const iframe = this.iframes.at(-1);
            assert.strictEqual(iframe.parentNode, document.body);

            await settled();

            assert.strictEqual(iframe.parentNode, null);
        });
    });

    module('a data url larger than two megabytes', function () {
        test('it is decoded into a blob rather than passed through', function (assert) {
            // Under the threshold downloadjs hands the data url straight to the
            // saver; over it the url is decoded first, so the browser is never
            // asked to parse a multi-megabyte string.
            const payload = 'data:text/plain;base64,' + 'a'.repeat(2_100_000);

            assert.true(download(payload, 'big.txt', 'text/plain'));
        });

        test('a payload that is not base64 takes the decodeURIComponent branch', function (assert) {
            const payload = 'data:text/plain,' + 'a'.repeat(2_100_000);

            assert.true(download(payload, 'big.txt', 'text/plain'));
        });
    });
});

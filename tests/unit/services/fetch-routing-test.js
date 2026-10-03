import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import corslite from 'dummy/utils/corslite';

/**
 * `fetch.routing`, and the corslite paths it runs through.
 *
 * corslite builds an XMLHttpRequest off `window`, so swapping the global
 * constructor intercepts every request without any network access. The fake
 * declares `onload` as an own property because corslite chooses between
 * `onload` and `onreadystatechange` with an `in` check.
 */
function fakeXhrClass(testContext) {
    return class FakeXHR {
        onload = null;
        onerror = null;
        onprogress = null;
        ontimeout = null;
        onabort = null;
        withCredentials = false;
        status = 200;
        response = '';

        open(method, url) {
            this.method = method;
            this.url = url;
            testContext.opened.push({ method, url });
        }

        send() {
            testContext.sent.push(this);
            this.status = testContext.status;
            this.response = testContext.responseBody;

            // Asynchronous, as a real request would be.
            Promise.resolve().then(() => {
                if (testContext.errorEvent) {
                    this.onerror(testContext.errorEvent);
                    return;
                }
                this.onload();
            });
        }
    };
}

module('Unit | Service | fetch (routing)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.originalXhr = window.XMLHttpRequest;
        this.opened = [];
        this.sent = [];
        this.status = 200;
        this.responseBody = '{"code":"Ok","trips":[]}';
        this.errorEvent = null;

        window.XMLHttpRequest = fakeXhrClass(this);

        // FetchService calls getHeaders() in its constructor, which reads
        // session.data.authenticated.
        this.owner.register(
            'service:session',
            class extends Service {
                get data() {
                    return { authenticated: {} };
                }
                get isAuthenticated() {
                    return false;
                }
            }
        );

        this.service = this.owner.lookup('service:fetch');
        this.lastUrl = () => this.opened.at(-1).url;
    });

    hooks.afterEach(function () {
        if (typeof this.originalXhr === 'function') {
            window.XMLHttpRequest = this.originalXhr;
        }
    });

    module('the url it builds', function () {
        test('coordinates become a semicolon-separated route', async function (assert) {
            await this.service.routing([
                [1, 2],
                [3, 4],
            ]);

            assert.true(this.lastUrl().endsWith('/trip/v1/driving/1,2;3,4'));
        });

        test('the routing host is used by default', async function (assert) {
            await this.service.routing([[1, 2]]);

            assert.true(this.lastUrl().startsWith('https://routing.fleetbase.io/'));
        });

        test('the subdomain can be changed', async function (assert) {
            await this.service.routing([[1, 2]], {}, { subdomain: 'valhalla' });

            assert.true(this.lastUrl().startsWith('https://valhalla.fleetbase.io/'));
        });

        test('an explicit host wins over the subdomain', async function (assert) {
            await this.service.routing([[1, 2]], {}, { host: 'https://osrm.example.com' });

            assert.true(this.lastUrl().startsWith('https://osrm.example.com/'));
        });

        test('the service, profile and version are configurable', async function (assert) {
            await this.service.routing([[1, 2]], {}, { service: 'route', profile: 'cycling', version: 'v2' });

            assert.true(this.lastUrl().includes('/route/v2/cycling/'));
        });

        test('a query is appended, and omitted when empty', async function (assert) {
            await this.service.routing([[1, 2]], { overview: 'full' });
            assert.true(this.lastUrl().endsWith('?overview=full'));

            await this.service.routing([[1, 2]]);
            assert.false(this.lastUrl().includes('?'));
        });

        test('it is always a GET', async function (assert) {
            await this.service.routing([[1, 2]]);

            assert.strictEqual(this.opened.at(-1).method, 'GET');
        });
    });

    module('the response', function () {
        test('a json body is parsed', async function (assert) {
            this.responseBody = '{"code":"Ok"}';

            assert.deepEqual(await this.service.routing([[1, 2]]), { code: 'Ok' });
        });

        test('a non-json body is passed through as-is', async function (assert) {
            this.responseBody = 'not json at all';

            assert.strictEqual(await this.service.routing([[1, 2]]), 'not json at all');
        });

        test('an empty response rejects', async function (assert) {
            this.responseBody = '';

            await assert.rejects(this.service.routing([[1, 2]]), /Request failed/);
        });

        test('a transport error rejects', async function (assert) {
            this.errorEvent = new Event('error');

            await assert.rejects(this.service.routing([[1, 2]]), /Request failed/);
        });
    });

    module('corslite itself', function () {
        test('a failing status hands the request back as the error', async function (assert) {
            this.status = 500;
            this.responseBody = 'boom';

            const [error, xhr] = await new Promise((resolve) => {
                corslite('https://routing.fleetbase.io/thing', (err, request) => resolve([err, request]));
            });

            assert.ok(error, 'the xhr arrives as the error');
            assert.strictEqual(xhr, null);
        });

        test('a 304 counts as successful', async function (assert) {
            this.status = 304;

            const [error] = await new Promise((resolve) => {
                corslite('https://routing.fleetbase.io/thing', (err, request) => resolve([err, request]));
            });

            assert.strictEqual(error, null);
        });

        test('it reports when the browser has no XMLHttpRequest', function (assert) {
            const saved = window.XMLHttpRequest;
            delete window.XMLHttpRequest;

            try {
                let reported;
                corslite('https://routing.fleetbase.io/thing', (error) => (reported = error));

                assert.true(reported instanceof Error);
                assert.strictEqual(reported.message, 'Browser not supported');
            } finally {
                window.XMLHttpRequest = saved;
            }
        });

        test('a cross-origin request on a client without withCredentials uses XDomainRequest', async function (assert) {
            // The IE8-9 path: corslite falls back to XDomainRequest and wraps the
            // callback so it can never fire before send() returns.
            const savedXdr = window.XDomainRequest;
            const testContext = this;
            const Legacy = class {
                onload = null;
                onerror = null;
                onprogress = null;
                ontimeout = null;
                onabort = null;
                status = undefined;
                response = 'legacy';
                open(method, url) {
                    testContext.opened.push({ method, url, legacy: true });
                }
                send() {
                    Promise.resolve().then(() => this.onload());
                }
            };
            // A client with no `withCredentials` at all is what makes corslite
            // fall back to XDomainRequest.
            const original = window.XMLHttpRequest;
            window.XMLHttpRequest = class {
                open() {}
                send() {}
            };
            window.XDomainRequest = Legacy;

            try {
                const [error, xhr] = await new Promise((resolve) => {
                    corslite('https://elsewhere.example.com/thing', (err, request) => resolve([err, request]));
                });

                assert.strictEqual(error, null, 'an undefined status counts as success');
                assert.true(xhr instanceof Legacy);
                assert.true(
                    this.opened.some((entry) => entry.legacy),
                    'the legacy client opened the request'
                );
            } finally {
                window.XMLHttpRequest = original;
                if (savedXdr === undefined) {
                    delete window.XDomainRequest;
                } else {
                    window.XDomainRequest = savedXdr;
                }
            }
        });
    });
});

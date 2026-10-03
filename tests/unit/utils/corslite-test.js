import corslite from 'dummy/utils/corslite';
import { module, test } from 'qunit';

/**
 * corslite is a small XMLHttpRequest wrapper: it decides whether a request is
 * cross-origin, wires the various completion events to one node-style
 * callback, and makes sure that callback fires at most once.
 *
 * The tests install a fake XMLHttpRequest so the handlers can be driven
 * directly; nothing here touches the network.
 */
class FakeXHR {
    // Declared so `'onload' in x` is true, as it is on a real XMLHttpRequest.
    onload = null;
    onerror = null;
    onprogress = null;
    ontimeout = null;
    onabort = null;
    withCredentials = false;

    constructor() {
        FakeXHR.instances.push(this);
        this.status = 200;
        this.readyState = 4;
    }

    open(method, url, async) {
        this.opened = { method, url, async };
    }

    send(body) {
        this.sent = body;
    }
}

/** An XHR with neither `onload` nor `withCredentials`, like IE8-9. */
class LegacyXHR {
    onreadystatechange = null;
    onerror = null;
    onprogress = null;
    ontimeout = null;
    onabort = null;

    constructor() {
        LegacyXHR.instances.push(this);
        this.status = 200;
        this.readyState = 4;
    }

    open(method, url, async) {
        this.opened = { method, url, async };
    }

    send(body) {
        this.sent = body;
    }
}

module('Unit | Utility | corslite', function (hooks) {
    hooks.beforeEach(function () {
        this.originalXHR = window.XMLHttpRequest;
        this.originalXDomainRequest = window.XDomainRequest;

        FakeXHR.instances = [];
        LegacyXHR.instances = [];
        window.XMLHttpRequest = FakeXHR;

        this.calls = [];
        this.callback = (...args) => this.calls.push(args);
        this.sameOrigin = `${location.protocol}//${location.host}/api`;
    });

    hooks.afterEach(function () {
        window.XMLHttpRequest = this.originalXHR;
        if (this.originalXDomainRequest === undefined) {
            delete window.XDomainRequest;
        } else {
            window.XDomainRequest = this.originalXDomainRequest;
        }
    });

    module('the request', function () {
        test('it opens an asynchronous GET and sends no body', function (assert) {
            corslite('https://example.com/api', this.callback);

            const [xhr] = FakeXHR.instances;
            assert.deepEqual(xhr.opened, { method: 'GET', url: 'https://example.com/api', async: true });
            assert.strictEqual(xhr.sent, null);
        });

        test('it returns the request object', function (assert) {
            const returned = corslite('https://example.com/api', this.callback);

            assert.strictEqual(returned, FakeXHR.instances[0]);
        });

        test('it reports an unsupported browser rather than throwing', function (assert) {
            window.XMLHttpRequest = undefined;

            const returned = corslite('https://example.com/api', this.callback);

            assert.strictEqual(this.calls.length, 1);
            assert.true(this.calls[0][0] instanceof Error);
            assert.strictEqual(this.calls[0][0].message, 'Browser not supported');
            assert.strictEqual(returned, this.calls.length, 'it hands back whatever the callback returned, not a request');
        });
    });

    module('completion', function () {
        test('a 200 calls back with the request and no error', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;

            xhr.onload();

            assert.deepEqual(this.calls, [[null, xhr]]);
        });

        test('a 304 counts as success', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;
            xhr.status = 304;

            xhr.onload();

            assert.deepEqual(this.calls, [[null, xhr]]);
        });

        test('the whole 2xx range counts as success', function (assert) {
            for (const status of [200, 201, 299]) {
                FakeXHR.instances = [];
                this.calls = [];
                corslite('https://example.com/api', this.callback);
                const [xhr] = FakeXHR.instances;
                xhr.status = status;

                xhr.onload();

                assert.strictEqual(this.calls[0][0], null, `${status} is a success`);
            }
        });

        test('an error status calls back with the request as the error', function (assert) {
            for (const status of [199, 300, 404, 500]) {
                FakeXHR.instances = [];
                this.calls = [];
                corslite('https://example.com/api', this.callback);
                const [xhr] = FakeXHR.instances;
                xhr.status = status;

                xhr.onload();

                assert.deepEqual(this.calls, [[xhr, null]], `${status} is a failure`);
            }
        });

        test('a request with no status at all is treated as success', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;
            xhr.status = undefined;

            xhr.onload();

            assert.deepEqual(this.calls, [[null, xhr]], 'XDomainRequest reports no status');
        });

        test('the callback is invoked with the request as its context', function (assert) {
            let context;
            corslite('https://example.com/api', function () {
                context = this;
            });
            const [xhr] = FakeXHR.instances;

            xhr.onload();

            assert.strictEqual(context, xhr);
        });
    });

    module('readystatechange fallback', function (hooks) {
        hooks.beforeEach(function () {
            window.XMLHttpRequest = LegacyXHR;
        });

        // A same-origin URL keeps this on the XMLHttpRequest path; a
        // cross-origin one would divert to XDomainRequest, which is a
        // different branch covered below.
        test('a request without onload is driven by readyState', function (assert) {
            corslite(this.sameOrigin, this.callback);
            const [xhr] = LegacyXHR.instances;

            assert.strictEqual(xhr.onload, undefined, 'onload is not used');
            xhr.onreadystatechange();

            assert.deepEqual(this.calls, [[null, xhr]]);
        });

        test('an intermediate readyState does not call back', function (assert) {
            corslite(this.sameOrigin, this.callback);
            const [xhr] = LegacyXHR.instances;

            for (const readyState of [0, 1, 2, 3]) {
                xhr.readyState = readyState;
                xhr.onreadystatechange();
            }

            assert.deepEqual(this.calls, [], 'only readyState 4 completes the request');
        });
    });

    module('failure events', function () {
        test('onerror calls back with the event', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;
            const event = { type: 'error' };

            xhr.onerror(event);

            assert.deepEqual(this.calls, [[event, null]]);
        });

        test('onerror without an event still reports a failure', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;

            xhr.onerror();

            assert.deepEqual(this.calls, [[true, null]], 'XDomainRequest provides no event');
        });

        test('after an error the callback never fires again', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;

            xhr.onerror({ type: 'error' });
            xhr.onload();
            xhr.onerror({ type: 'error' });

            assert.strictEqual(this.calls.length, 1, 'the callback is replaced with a noop');
        });

        test('ontimeout calls back once and then stops', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;
            const event = { type: 'timeout' };

            xhr.ontimeout(event);
            xhr.ontimeout(event);

            assert.deepEqual(this.calls, [[event, null]]);
        });

        test('onabort calls back once and then stops', function (assert) {
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;
            const event = { type: 'abort' };

            xhr.onabort(event);
            xhr.onabort(event);

            assert.deepEqual(this.calls, [[event, null]]);
        });

        test('onprogress is set, which IE9 requires', function (assert) {
            corslite('https://example.com/api', this.callback);

            assert.strictEqual(typeof FakeXHR.instances[0].onprogress, 'function');
        });
    });

    module('cross-origin detection', function () {
        test('a same-origin URL is not treated as cross-origin', function (assert) {
            corslite(this.sameOrigin, this.callback);

            assert.strictEqual(FakeXHR.instances.length, 1, 'the standard request object is used');
        });

        test('a relative URL is not treated as cross-origin', function (assert) {
            corslite('/api/orders', this.callback);

            assert.strictEqual(FakeXHR.instances.length, 1);
        });

        test('an explicit cors flag skips detection', function (assert) {
            corslite('https://example.com/api', this.callback, false);

            assert.strictEqual(FakeXHR.instances.length, 1);
        });

        test('a cross-origin URL falls back to XDomainRequest when withCredentials is missing', function (assert) {
            // An XHR that supports onload but not withCredentials — the IE8-9
            // shape corslite falls back from.
            window.XMLHttpRequest = class {
                onload = null;
                open() {}
                send() {}
            };
            const created = [];
            window.XDomainRequest = class {
                constructor() {
                    created.push(this);
                    this.status = undefined;
                }
                open() {}
                send() {}
            };

            corslite('https://example.com/api', this.callback);

            assert.strictEqual(created.length, 1, 'the legacy cross-origin transport is used');
        });

        test('a modern browser keeps XMLHttpRequest for cross-origin requests', function (assert) {
            window.XDomainRequest = class {};

            corslite('https://example.com/api', this.callback);

            assert.strictEqual(FakeXHR.instances.length, 1, 'withCredentials is present, so no fallback');
        });
    });

    module('progress', function () {
        test('onprogress is a no-op that leaves the callback alone', function (assert) {
            // IE9 required onprogress to be a distinct function, so corslite
            // assigns an empty one. Nothing else ever calls it; driving the fake
            // transport is the only way to see that it does nothing.
            corslite('https://example.com/api', this.callback);
            const [xhr] = FakeXHR.instances;

            xhr.onprogress();

            assert.deepEqual(this.calls, [], 'no callback yet');

            xhr.onload();

            assert.deepEqual(this.calls, [[null, xhr]], 'and completion still works afterwards');
        });
    });
});

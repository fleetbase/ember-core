import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import Model, { attr } from '@ember-data/model';
import corslite from 'dummy/utils/corslite';
import legacyFetchFrom from '@fleetbase/ember-core/decorators/legacy-fetch-from';
import loadExtensions, { clearExtensionsCache } from 'dummy/utils/load-extensions';
import lookupUserIp, { getBrowserTimezone } from '@fleetbase/ember-core/utils/lookup-user-ip';

/**
 * The last reachable statements in the addon — every one a catch block guarding
 * against a browser API that normally succeeds.
 *
 * Each override is installed around the CALL and removed in a `finally`.
 * localStorage and Intl are used by the test framework and by
 * ember-local-storage's own teardown, so holding either broken for a whole test
 * takes the run with it.
 */
function withBroken(target, method, fn) {
    const original = target[method];
    target[method] = () => {
        throw new Error('storage unavailable');
    };

    try {
        return fn();
    } finally {
        target[method] = original;
    }
}

module('Unit | Utility | load-extensions (cache failures)', function () {
    test('a cache write that throws is swallowed', async function (assert) {
        const originalFetch = window.fetch;
        window.fetch = () =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve([{ name: '@fleetbase/fleetops-engine' }]),
            });

        try {
            const extensions = await withBroken(window.localStorage, 'setItem', () => loadExtensions());

            assert.deepEqual(
                extensions.map((e) => e.name),
                ['@fleetbase/fleetops-engine'],
                'the extensions are still returned; only the caching is lost'
            );
            assert.strictEqual(window.localStorage.getItem('fleetbase_extensions_list'), null, 'nothing was cached');
        } finally {
            window.fetch = originalFetch;
            window.localStorage.removeItem('fleetbase_extensions_list');
            window.localStorage.removeItem('fleetbase_extensions_version');
        }
    });

    test('a cache clear that throws is swallowed, leaving the cache in place', function (assert) {
        window.localStorage.setItem('fleetbase_extensions_list', '[]');

        try {
            withBroken(window.localStorage, 'removeItem', () => clearExtensionsCache());

            assert.strictEqual(window.localStorage.getItem('fleetbase_extensions_list'), '[]', 'the clear failed silently rather than propagating');
        } finally {
            window.localStorage.removeItem('fleetbase_extensions_list');
        }
    });
});

module('Unit | Utility | lookup-user-ip (cache and timezone failures)', function (hooks) {
    hooks.beforeEach(function () {
        window.localStorage.removeItem('fleetbase:whois');
    });

    hooks.afterEach(function () {
        window.localStorage.removeItem('fleetbase:whois');
    });

    test('a whois cache write that throws still resolves the lookup', async function (assert) {
        const originalFetch = window.fetch;
        window.fetch = () =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ ip: '1.2.3.4', city: 'Kuala Lumpur', country_code: 'MY', timezone_name: 'Asia/Kuala_Lumpur' }),
            });

        try {
            const whois = await withBroken(window.localStorage, 'setItem', () => lookupUserIp({ cache: true }));

            assert.strictEqual(whois.city, 'Kuala Lumpur', 'the caller still gets the lookup');
            assert.strictEqual(window.localStorage.getItem('fleetbase:whois'), null, 'nothing was cached');
        } finally {
            window.fetch = originalFetch;
        }
    });

    test('a browser with no working Intl reports no timezone', function (assert) {
        const original = Intl.DateTimeFormat;
        Intl.DateTimeFormat = () => {
            throw new Error('no Intl');
        };

        try {
            assert.strictEqual(getBrowserTimezone(), null);
        } finally {
            Intl.DateTimeFormat = original;
        }
    });

    test('a working Intl reports the resolved zone', function (assert) {
        assert.strictEqual(typeof getBrowserTimezone(), 'string');
    });
});

module('Unit | Decorator | legacy-fetch-from (the prototype accessor)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register(
            'service:fetch',
            class extends Service {
                get() {
                    return Promise.resolve([]);
                }
            }
        );
    });

    test('the symbol-backed accessor reads and writes through', function (assert) {
        // The decorator defines its accessor on the PROTOTYPE. A native class
        // field shadows it with an own property — that is the pinned defect —
        // so reaching the accessor at all means applying the decorator to a
        // class that declares no such field.
        const Subject = EmberObject.extend({});
        legacyFetchFrom('widgets')(Subject.prototype, 'records');

        const subject = Subject.create(this.owner.ownerInjection());

        assert.strictEqual(subject.records, null, 'the accessor returns the symbol default, not undefined');

        subject.records = ['a'];

        assert.deepEqual(subject.records, ['a'], 'and the setter writes through to the same symbol');
    });
});

module('Unit | Utility | corslite (a synchronous callback)', function (hooks) {
    hooks.beforeEach(function () {
        this.originalXhr = window.XMLHttpRequest;
        this.originalXdr = window.XDomainRequest;

        // No withCredentials, so corslite falls back to XDomainRequest.
        window.XMLHttpRequest = class {
            open() {}
            send() {}
        };
    });

    hooks.afterEach(function () {
        window.XMLHttpRequest = this.originalXhr;
        if (this.originalXdr === undefined) {
            delete window.XDomainRequest;
        } else {
            window.XDomainRequest = this.originalXdr;
        }
    });

    test('a client that calls back before send() returns is deferred', async function (assert) {
        // The wrapper corslite puts around the callback exists for exactly this:
        // a client that fires onload synchronously inside send(), before `sent`
        // has been set. It defers to the next runloop rather than calling back
        // from inside send().
        const order = [];
        window.XDomainRequest = class {
            onload = null;
            onerror = null;
            onprogress = null;
            ontimeout = null;
            onabort = null;
            status = undefined;
            response = 'ok';
            open() {}
            send() {
                order.push('send');
                this.onload();
            }
        };

        corslite('https://elsewhere.example.com/thing', () => order.push('callback'));

        assert.deepEqual(order, ['send'], 'the callback has not fired yet');

        await settled();

        assert.deepEqual(order, ['send', 'callback'], 'it lands after send() returned');
    });
});

class FileModel extends Model {
    @attr('string') original_filename;
}

module('Unit | Service | fetch (upload error callback)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        const testContext = this;

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

        this.serverErrors = [];
        this.owner.register(
            'service:notifications',
            class extends Service {
                serverError(error, message) {
                    testContext.serverErrors.push({ error, message });
                }
            }
        );

        this.owner.register('model:file', FileModel);
        this.service = this.owner.lookup('service:fetch');
    });

    test('an error callback is invoked when the response cannot be normalized', async function (assert) {
        const errors = [];
        const removed = [];
        const file = {
            state: 'queued',
            size: 42,
            queue: { remove: (f) => removed.push(f) },
            // A payload with no uuid cannot be pushed, so the outer catch runs.
            upload: () => Promise.resolve({ json: () => Promise.resolve({ file: { no_uuid: true } }) }),
        };

        await this.service.uploadFile.perform(file, {}, undefined, (error) => errors.push(error));

        assert.strictEqual(errors.length, 1, 'the caller is told');
        assert.deepEqual(removed, [file], 'and the file leaves the queue');
    });
});

module('Unit | Service | report-actions (the edit modal)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.shown = [];
        this.performed = [];
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                show(template, options) {
                    testContext.shown.push({ template, options });
                    return Promise.resolve();
                }
                setOption() {}
                getOption() {
                    return null;
                }
            }
        );

        for (const name of ['resource-context-panel', 'notifications', 'events', 'abilities', 'fetch', 'current-user', 'table-context', 'universe', 'crud', 'router', 'intl', 'store']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:report-actions');
        this.service.modalTask.perform = (...args) => {
            this.performed.push(args);
            return Promise.resolve('saved');
        };
    });

    test('confirming an edit saves the report through the modal task', async function (assert) {
        const report = { name: 'Weekly volume' };

        this.service.modal.edit(report);
        const modal = { startLoading() {}, stopLoading() {} };
        const result = await this.shown[0].options.confirm(modal);

        assert.strictEqual(result, 'saved');
        assert.deepEqual(this.performed, [[modal, 'saveTask', report, { refresh: true }]]);
    });

    test('save options reach the task', async function (assert) {
        this.service.modal.edit({ name: 'Weekly volume' }, {}, { callback: 'mine' });

        await this.shown[0].options.confirm({});

        assert.deepEqual(this.performed[0][3], { refresh: true, callback: 'mine' });
    });
});

import lookupUserIp, { getBrowserTimezone, ensureWhoisTimezone } from '@fleetbase/ember-core/utils/lookup-user-ip';
import { module, test } from 'qunit';

const CACHE_KEY = 'fleetbase:whois';

/**
 * lookupUserIp asks two geolocation APIs in turn, normalizes whichever answers
 * into one shape, caches it for an hour, and falls back to browser-derived data
 * when neither responds.
 *
 * `fetch` and `localStorage` are both resolved at call time, so the global is
 * swapped for the duration and restored afterwards.
 */
module('Unit | Utility | lookup-user-ip', function (hooks) {
    hooks.beforeEach(function () {
        this.originalFetch = window.fetch;
        this.requested = [];
        window.localStorage.removeItem(CACHE_KEY);

        this.respondWith = (responses) => {
            let call = 0;
            window.fetch = (url) => {
                this.requested.push(url);
                const next = responses[call++];
                if (typeof next === 'function') {
                    return next();
                }
                return Promise.resolve({
                    ok: next.ok ?? true,
                    status: next.status ?? 200,
                    json: () => Promise.resolve(next.json ?? {}),
                });
            };
        };
    });

    hooks.afterEach(function () {
        window.fetch = this.originalFetch;
        window.localStorage.removeItem(CACHE_KEY);
    });

    module('getBrowserTimezone', function () {
        test('it reports the browser timezone', function (assert) {
            assert.strictEqual(getBrowserTimezone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
        });
    });

    module('ensureWhoisTimezone', function () {
        test('an existing timezone is kept', function (assert) {
            assert.strictEqual(ensureWhoisTimezone({ timezone: 'Asia/Tokyo' }).timezone, 'Asia/Tokyo');
        });

        test('a missing timezone is filled from the browser', function (assert) {
            assert.strictEqual(ensureWhoisTimezone({ city: 'KL' }).timezone, getBrowserTimezone());
        });

        test('the rest of the payload is preserved', function (assert) {
            assert.strictEqual(ensureWhoisTimezone({ city: 'KL' }).city, 'KL');
        });

        test('no argument at all still yields a timezone', function (assert) {
            assert.strictEqual(ensureWhoisTimezone().timezone, getBrowserTimezone());
            assert.strictEqual(ensureWhoisTimezone(null).timezone, getBrowserTimezone());
        });
    });

    module('the primary API', function () {
        test('a successful lookup is normalized', async function (assert) {
            this.respondWith([
                {
                    json: {
                        ip: '1.2.3.4',
                        city: 'Kuala Lumpur',
                        country_code: 'MY',
                        latitude: 3.1,
                        longitude: 101.6,
                        timezone_name: 'Asia/Kuala_Lumpur',
                        currency_code: 'MYR',
                        currency_name: 'Malaysian Ringgit',
                        language_code: 'ms',
                        language_name: 'Malay',
                    },
                },
            ]);

            const whois = await lookupUserIp({ cache: false });

            assert.strictEqual(whois.ip, '1.2.3.4');
            assert.strictEqual(whois.city, 'Kuala Lumpur');
            assert.strictEqual(whois.country_code, 'MY');
            assert.strictEqual(whois.timezone, 'Asia/Kuala_Lumpur');
            assert.deepEqual(whois.currency, { code: 'MYR', name: 'Malaysian Ringgit' });
            assert.deepEqual(whois.languages, [{ code: 'ms', name: 'Malay' }]);
            assert.strictEqual(whois._source, 'geoiplookup.io');
        });

        test('it is asked first', async function (assert) {
            this.respondWith([{ json: {} }]);

            await lookupUserIp({ cache: false });

            assert.strictEqual(this.requested.length, 1);
            assert.true(this.requested[0].includes('geoiplookup.io'));
        });

        test('a missing timezone falls back to the browser', async function (assert) {
            this.respondWith([{ json: { ip: '1.2.3.4' } }]);

            const whois = await lookupUserIp({ cache: false });

            assert.strictEqual(whois.timezone, getBrowserTimezone());
        });
    });

    module('the fallback API', function () {
        test('a non-ok primary response moves on to the second', async function (assert) {
            this.respondWith([{ ok: false, status: 503 }, { json: { ip: '5.6.7.8', city: 'Tokyo', timezone: 'Asia/Tokyo' } }]);

            const whois = await lookupUserIp({ cache: false });

            assert.strictEqual(this.requested.length, 2);
            assert.true(this.requested[1].includes('ipapi.co'));
            assert.strictEqual(whois.city, 'Tokyo');
            assert.strictEqual(whois._source, 'ipapi.co');
        });

        test('a thrown primary also moves on', async function (assert) {
            this.respondWith([() => Promise.reject(new Error('offline')), { json: { ip: '5.6.7.8' } }]);

            const whois = await lookupUserIp({ cache: false });

            assert.strictEqual(whois.ip, '5.6.7.8');
        });

        test('its language list is split into entries', async function (assert) {
            this.respondWith([{ ok: false }, { json: { languages: 'en,ms' } }]);

            const whois = await lookupUserIp({ cache: false });

            assert.deepEqual(whois.languages, [
                { code: 'en', name: 'en' },
                { code: 'ms', name: 'ms' },
            ]);
        });

        test('an absent language list yields no entries', async function (assert) {
            this.respondWith([{ ok: false }, { json: {} }]);

            assert.deepEqual((await lookupUserIp({ cache: false })).languages, []);
        });
    });

    module('the fallback payload', function () {
        test('both APIs failing yields browser-derived data', async function (assert) {
            this.respondWith([() => Promise.reject(new Error('offline')), () => Promise.reject(new Error('offline'))]);

            const whois = await lookupUserIp({ cache: false });

            assert.strictEqual(whois._source, 'fallback');
            assert.strictEqual(whois.ip, null);
            assert.strictEqual(whois.timezone, getBrowserTimezone());
            assert.strictEqual(whois.languages[0].name, navigator.language || 'en-US');
        });
    });

    module('caching', function () {
        test('a successful lookup is cached', async function (assert) {
            this.respondWith([{ json: { ip: '1.2.3.4', city: 'Kuala Lumpur' } }]);

            await lookupUserIp();

            const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY));
            assert.strictEqual(cached.city, 'Kuala Lumpur');
        });

        test('a fresh cache entry is served without a request', async function (assert) {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ city: 'Cached City', timezone: 'Asia/Tokyo', _timestamp: Date.now() }));
            this.respondWith([{ json: { city: 'Network City' } }]);

            const whois = await lookupUserIp();

            assert.strictEqual(whois.city, 'Cached City');
            assert.deepEqual(this.requested, [], 'nothing was fetched');
        });

        test('an entry older than an hour is discarded and refetched', async function (assert) {
            const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ city: 'Stale City', _timestamp: twoHoursAgo }));
            this.respondWith([{ json: { city: 'Fresh City' } }]);

            const whois = await lookupUserIp();

            assert.strictEqual(whois.city, 'Fresh City');
            assert.strictEqual(this.requested.length, 1);
        });

        test('a corrupt cache entry is survivable', async function (assert) {
            window.localStorage.setItem(CACHE_KEY, 'not json');
            this.respondWith([{ json: { city: 'Fresh City' } }]);

            const whois = await lookupUserIp();

            assert.strictEqual(whois.city, 'Fresh City');
        });

        test('a cached entry with no timezone gains one', async function (assert) {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ city: 'Cached City', _timestamp: Date.now() }));

            const whois = await lookupUserIp();

            assert.strictEqual(whois.timezone, getBrowserTimezone());
            assert.strictEqual(JSON.parse(window.localStorage.getItem(CACHE_KEY)).timezone, getBrowserTimezone(), 'and the repaired entry is written back');
        });

        test('cache false skips both the read and the write', async function (assert) {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ city: 'Cached City', _timestamp: Date.now() }));
            this.respondWith([{ json: { city: 'Network City' } }]);

            const whois = await lookupUserIp({ cache: false });

            assert.strictEqual(whois.city, 'Network City', 'the cache was not read');
            assert.strictEqual(JSON.parse(window.localStorage.getItem(CACHE_KEY)).city, 'Cached City', 'and not written');
        });
    });

    module('browser-derived fallbacks', function () {
        test('a browser reporting no timezone yields null rather than an empty string', function (assert) {
            // Intl is replaced around the CALL only — the framework formats dates
            // between tests and a permanently broken Intl takes the run with it.
            const originalDateTimeFormat = Intl.DateTimeFormat;
            Intl.DateTimeFormat = function () {
                return { resolvedOptions: () => ({}) };
            };

            try {
                assert.strictEqual(getBrowserTimezone(), null);
            } finally {
                Intl.DateTimeFormat = originalDateTimeFormat;
            }
        });

        test('a browser reporting no language falls back to en-US', async function (assert) {
            const originalLanguage = Object.getOwnPropertyDescriptor(window.navigator, 'language') ?? Object.getOwnPropertyDescriptor(Navigator.prototype, 'language');
            Object.defineProperty(window.navigator, 'language', { value: '', configurable: true });
            this.respondWith([() => Promise.reject(new Error('offline')), () => Promise.reject(new Error('offline'))]);

            try {
                const whois = await lookupUserIp({ cache: false });

                assert.deepEqual(whois.languages[0], { code: 'en', name: 'en-US' }, 'the declared default stands in');
                assert.strictEqual(whois.ip, null, 'and the rest of the fallback shape is empty');
            } finally {
                if (originalLanguage) {
                    Object.defineProperty(window.navigator, 'language', originalLanguage);
                }
            }
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import ObjectProxy from '@ember/object/proxy';
import fromStore from '@fleetbase/ember-core/decorators/from-store';
import legacyFromStore from '@fleetbase/ember-core/decorators/legacy-from-store';
import serializeModel from 'dummy/utils/serialize-model';

/**
 * The last handful of one-line branches, each the only thing left in its file.
 * They are collected here rather than spread across seven new files, since none
 * of them warrants a module of its own.
 */
class OnComplete extends EmberObject {
    @fromStore('widget', {}, { onComplete: (response, subject) => subject.seen.push(response) }) records;
}

class LegacyOnComplete extends EmberObject {
    @legacyFromStore('widget', {}, { onComplete: (response, subject) => subject.seen.push(response) }) records;
}

module('Unit | Decorator | from-store (onComplete)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.response = ['record-a'];
        const testContext = this;

        this.owner.register(
            'service:store',
            class extends Service {
                query() {
                    return Promise.resolve(testContext.response);
                }
            }
        );
    });

    test('onComplete receives the response and the subject', async function (assert) {
        const subject = OnComplete.create(this.owner.ownerInjection(), { seen: [] });

        subject.records;
        await settled();

        assert.deepEqual(subject.seen, [this.response]);
        assert.deepEqual(subject.records, this.response, 'and the property is still assigned');
    });

    test('the legacy decorator does the same', async function (assert) {
        const subject = LegacyOnComplete.create(this.owner.ownerInjection(), { seen: [] });

        subject.records;
        await settled();

        assert.deepEqual(subject.seen, [this.response]);
    });
});

module('Unit | Utility | serialize-model (a proxy with toJSON)', function () {
    test('toJSON is preferred when the subject has one', function (assert) {
        // An ember-data record has `serialize` but no `toJSON`, so the toJSON
        // branch needs a subject that isModel accepts and that does have one —
        // an ObjectProxy is the one shape that qualifies.
        const proxied = ObjectProxy.extend({
            toJSON() {
                return { via: 'toJSON' };
            },
            serialize() {
                return { via: 'serialize' };
            },
        }).create();

        assert.deepEqual(serializeModel(proxied), { via: 'toJSON' }, 'serialize is not consulted');
    });
});

module('Unit | Service | theme (system colour scheme)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register(
            'service:current-user',
            class extends Service {
                getOption() {
                    return null;
                }
            }
        );
        for (const name of ['universe', 'router', 'fetch', 'session']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:theme');
        this.service.initialTheme = null;

        // matchMedia is replaced around the CALL only — it is a global the test
        // framework and Ember itself may consult.
        this.withColorScheme = (matches, fn) => {
            const original = window.matchMedia;
            window.matchMedia = () => ({ matches, addEventListener() {}, removeEventListener() {} });
            try {
                return fn();
            } finally {
                window.matchMedia = original;
            }
        };
    });

    test('a system preference for dark is honoured', function (assert) {
        assert.strictEqual(
            this.withColorScheme(true, () => this.service.getTheme()),
            'dark'
        );
    });

    test('no system preference still ends up dark, by default rather than by preference', function (assert) {
        assert.strictEqual(
            this.withColorScheme(false, () => this.service.getTheme()),
            'dark'
        );
    });
});

module('Unit | Service | language (saving a locale)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.postRejects = false;
        const testContext = this;

        this.owner.register(
            'service:fetch',
            class extends Service {
                post(path, body) {
                    testContext.posted = { path, body };
                    return testContext.postRejects ? Promise.reject(new Error('offline')) : Promise.resolve({});
                }
            }
        );
        for (const name of ['intl', 'current-user', 'session']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:language');
    });

    test('it posts the chosen locale', async function (assert) {
        await this.service.saveUserLocale.perform('en-gb');

        assert.deepEqual(this.posted, { path: 'users/locale', body: { locale: 'en-gb' } });
    });

    test('a failure is swallowed rather than surfaced', async function (assert) {
        this.postRejects = true;

        const result = await this.service.saveUserLocale.perform('en-gb');

        assert.strictEqual(result, undefined, 'the caller cannot tell the save failed');
    });
});

module('Unit | Service | filters (the unreachable filter)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.searchParams = {};
        const testContext = this;

        this.owner.register(
            'service:url-search-params',
            class extends Service {
                get(key) {
                    return testContext.searchParams[key];
                }
            }
        );
        this.owner.register('service:router', class extends Service {});

        this.service = this.owner.lookup('service:filters');

        this.useCurrentRoute = ({ queryParams = {}, url = {} } = {}) => {
            this.searchParams = url;
            const route = { controller: null, queryParams };
            this.owner.register('router:main', { _routerMicrolib: { currentRouteInfos: [{ _route: route }] } }, { instantiate: false });
        };
    });

    test('activeFilters can never actually skip anything', function (assert) {
        // Pinned, not fixed. `activeFilters` loops over `this.getQueryParams()`
        // and skips entries that are blank or managed:
        //
        //     if (isBlank(value) || this.managedQueryParams.includes(queryParam)) continue;
        //
        // but getQueryParams() — called with no controller, so taking the route
        // path — has ALREADY dropped both: it skips managed params and only adds
        // a value `if (value)`. The `continue` is therefore unreachable, and the
        // filtering is duplicated one layer apart.
        this.useCurrentRoute({
            queryParams: { status: null, page: null, type: null },
            url: { status: 'active', page: '2', type: '' },
        });

        assert.deepEqual(
            this.service.activeFilters,
            [{ queryParam: 'status', label: 'status', value: 'active' }],
            'page was dropped as managed and type as blank — both before activeFilters saw them'
        );
        assert.deepEqual(this.service.getQueryParams(), { status: 'active' }, 'which is the same list, already filtered');
    });
});

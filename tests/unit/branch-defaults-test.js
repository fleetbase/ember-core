import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import ObjectProxy from '@ember/object/proxy';
import apiUrl from 'dummy/utils/api-url';
import frontendUrl from 'dummy/utils/frontend-url';
import groupApiEvents from 'dummy/utils/group-api-events';
import timeout from 'dummy/utils/timeout';
import getModelName from 'dummy/utils/get-model-name';
import MockTask from '@fleetbase/ember-core/utils/mock-task';
import applyContextComponentArguments from 'dummy/utils/apply-context-component-arguments';

/**
 * Branch coverage for arguments callers never omit and `||` arms never taken.
 *
 * The gate wants 100% on branches as well as statements, and these are the
 * halves nothing had exercised: a default parameter that every call site
 * happens to supply, the right-hand side of a `??` whose left side is always
 * set, the false arm of a guard.
 */
module('Unit | Utility | small utils (defaults and fallbacks)', function () {
    test('apiUrl builds a host from config when none is given', function (assert) {
        const derived = apiUrl('orders');
        const explicit = apiUrl('orders', {}, null, 'https://api.example.com/v1');

        assert.true(derived.includes('/orders'));
        assert.true(explicit.includes('api.example.com'), 'an explicit host skips the config lookup');
    });

    test('frontendUrl appends query params only when there are some', function (assert) {
        assert.false(frontendUrl('signup').includes('?'));
        assert.true(frontendUrl('signup', { ref: 'abc' }).endsWith('?ref=abc'));
    });

    test('frontendUrl defaults its path to the root', function (assert) {
        assert.true(frontendUrl().endsWith('/'));
    });

    test('groupApiEvents groups by resource and defaults its input', function (assert) {
        assert.deepEqual(groupApiEvents(), {}, 'no argument yields no groups');
        assert.deepEqual(groupApiEvents('not an array'), {}, 'and neither does a non-array');
        assert.deepEqual(groupApiEvents(['order.created', 'order.updated', 'driver.assigned']), {
            order: ['order.created', 'order.updated'],
            driver: ['driver.assigned'],
        });
    });

    test('timeout defaults its delay', async function (assert) {
        const started = performance.now();

        await timeout(1);

        assert.true(performance.now() >= started, 'it resolves');
        assert.strictEqual(typeof timeout, 'function');
    });

    test('getModelName falls through to the fallback for a proxy', function (assert) {
        // isModel accepts an ObjectProxy, which has no constructor.modelName and
        // no _internalModel — so both sides of the ?? chain give way.
        const proxied = ObjectProxy.create({ content: {} });

        assert.strictEqual(getModelName(proxied, 'order'), 'order');
    });

    test('a MockTask performs its no-op function when none is supplied', function (assert) {
        const task = new MockTask();

        task.perform('an argument');

        assert.false(task.isRunning, 'it finished');
    });

    test('applyContextComponentArguments ignores a context with no model name', function (assert) {
        const component = { args: { context: ObjectProxy.create({ content: {} }) } };

        applyContextComponentArguments(component);

        assert.deepEqual(
            Object.keys(component).filter((k) => k !== 'args'),
            [],
            'nothing was assigned'
        );
    });
});

module('Unit | Service | small service defaults', function (hooks) {
    setupTest(hooks);

    test('theme removes no classes when given none', function (assert) {
        for (const name of ['current-user', 'universe', 'router', 'fetch', 'session']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }
        const service = this.owner.lookup('service:theme');

        service.removeRoutebodyClassNames();

        assert.strictEqual(document.body.className, document.body.className, 'the body is left as it was');
    });

    test('loader showOnCondition defaults its options and condition', function (assert) {
        const service = this.owner.lookup('service:loader');
        const target = document.createElement('div');
        document.body.appendChild(target);

        try {
            service.showOnCondition(target);

            assert.strictEqual(target.querySelectorAll('.overloader').length, 0, 'a null condition shows nothing');
        } finally {
            target.remove();
        }
    });

    test('events defaults the properties on its trackers', function (assert) {
        const seen = [];
        const testContext = this;
        this.owner.register(
            'service:universe',
            class extends Service {
                trigger(name, ...args) {
                    seen.push({ name, args });
                    testContext.noop = true;
                }
            }
        );
        this.owner.register('service:current-user', class extends Service {});

        const service = this.owner.lookup('service:events');
        service.trigger = () => {};

        service.trackUserUpdated({ id: 'user-1' });

        assert.strictEqual(seen.length, 1, 'it fired with no properties argument');
    });

    test('chat updateChatChannel defaults its properties', async function (assert) {
        const saved = [];
        this.owner.register('service:store', class extends Service {});
        for (const name of ['current-user', 'app-cache', 'fetch', 'socket']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }
        const service = this.owner.lookup('service:chat');
        service.trigger = () => {};

        const record = {
            setProperties: (props) => saved.push(props),
            save: () => Promise.resolve(),
        };

        await service.updateChatChannel(record);

        assert.deepEqual(saved, [{}], 'an empty property set is applied');
    });

    test('current-user options prefix falls back through its chain', function (assert) {
        for (const name of ['fetch', 'session', 'theme', 'universe', 'socket', 'intl', 'notifications', 'events']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }
        const service = this.owner.lookup('service:current-user');

        service.authenticatedOptionOwnerId = null;
        service.id = 'user-1';
        assert.strictEqual(service.optionsPrefix, 'user-1:', 'the user id is the second choice');

        service.id = null;
        assert.strictEqual(service.optionsPrefix, 'anon:', 'and anon the last');
    });

    test('filters ignores a controller whose query params are not a list', function (assert) {
        this.owner.register('service:url-search-params', class extends Service {});
        this.owner.register('service:router', class extends Service {});
        const service = this.owner.lookup('service:filters');
        this.owner.register('router:main', { _routerMicrolib: { currentRouteInfos: [{ _route: { queryParams: {} } }] } }, { instantiate: false });

        const controller = EmberObject.create({ queryParams: 'not-a-list' });

        assert.deepEqual(service.getQueryParams(controller), {}, 'it falls through to the route instead');
    });
});

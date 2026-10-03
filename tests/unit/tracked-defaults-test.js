import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * A `@tracked field = value` initializer only runs when the property is READ
 * before it is written. Most of these services are configured immediately —
 * initialize() sets modelName, setApplicationInstance sets the instance, a load
 * sets whoisData — so the declared defaults are never observed, and nothing
 * pins what a freshly-built service looks like before anyone configures it.
 *
 * Each service is built with factoryFor().create() rather than looked up: the
 * container hands back a singleton another test may already have configured.
 */
module('Unit | tracked defaults', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        for (const name of [
            'universe',
            'universe/registry-service',
            'universe/extension-manager',
            'universe/hook-service',
            'modals-manager',
            'notifications',
            'events',
            'abilities',
            'fetch',
            'table-context',
            'resource-context-panel',
            'crud',
            'router',
            'intl',
            'session',
            'theme',
            'socket',
        ]) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        // Deliberately NOT stubbed above: menu-service, widget-service and
        // current-user are the subjects here, and registering a bare stub over
        // one of them is what made three of these read `undefined` rather than
        // its declared default on the first attempt.
        this.build = (name) => this.owner.factoryFor(`service:${name}`).create();
    });

    test('resource-action starts unconfigured', function (assert) {
        const service = this.build('resource-action');

        assert.strictEqual(service.modelName, null, 'so initialize() must be called before use');
        assert.strictEqual(service.permissionPrefix, 'fleet-ops');
        assert.strictEqual(service.mountPrefix, 'fleet-ops');
    });

    test('the menu service starts with no application instance', function (assert) {
        assert.strictEqual(this.build('universe/menu-service').applicationInstance, null);
    });

    test('the widget service starts with no application instance', function (assert) {
        assert.strictEqual(this.build('universe/widget-service').applicationInstance, null);
    });

    test('current-user starts anonymous, with no company and no location', function (assert) {
        const service = this.build('current-user');

        assert.deepEqual(service.company, {});
        assert.deepEqual(service.whoisData, {});
    });
});

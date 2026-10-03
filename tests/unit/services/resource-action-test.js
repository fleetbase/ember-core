import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * ResourceActionService is the base every model-specific action service extends
 * (custom-fields-registry and report-actions today). These tests cover the
 * synchronous surface it provides to subclasses — configuration, record naming,
 * permission strings and instantiation — rather than the ember-concurrency
 * tasks, which are driven through modals and the network.
 */
module('Unit | Service | resource-action', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.abilityChecks = [];
        this.allowed = true;
        const testContext = this;

        this.owner.register(
            'service:abilities',
            class extends Service {
                can(permission) {
                    testContext.abilityChecks.push(permission);
                    return testContext.allowed;
                }
            }
        );

        for (const name of ['notifications', 'intl', 'modals-manager', 'crud', 'fetch', 'current-user', 'table-context', 'resource-context-panel', 'universe', 'events']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        class WidgetModel extends Model {
            @attr('string') name;
            @attr('string') display_name;
            @attr('string') public_id;
            @attr('string') label;
        }

        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:resource-action');
    });

    module('initialize', function () {
        test('it sets the model name and returns the service for chaining', function (assert) {
            assert.strictEqual(this.service.initialize('widget'), this.service);
            assert.strictEqual(this.service.modelName, 'widget');
        });

        test('it applies the documented defaults', function (assert) {
            this.service.initialize('widget');

            assert.strictEqual(this.service.modelNamePath, 'name');
            assert.strictEqual(this.service.permissionPrefix, 'fleet-ops');
            assert.strictEqual(this.service.mountPrefix, 'console.fleet-ops');
        });

        test('the mount prefix follows the permission prefix', function (assert) {
            this.service.initialize('widget', { permissionPrefix: 'storefront' });

            assert.strictEqual(this.service.mountPrefix, 'console.storefront');
        });

        test('an explicit mount prefix wins over the derived one', function (assert) {
            this.service.initialize('widget', { permissionPrefix: 'storefront', mountPrefix: 'console.custom' });

            assert.strictEqual(this.service.mountPrefix, 'console.custom');
        });

        test('option objects are merged into the defaults rather than replacing them', function (assert) {
            this.service.defaultAttributes = { type: 'default', status: 'draft' };

            this.service.initialize('widget', { defaultAttributes: { status: 'active' } });

            assert.deepEqual(this.service.defaultAttributes, { type: 'default', status: 'active' }, 'existing keys survive and the supplied one wins');
        });

        test('a custom model name path is honoured', function (assert) {
            this.service.initialize('widget', { modelNamePath: 'label' });

            assert.strictEqual(this.service.modelNamePath, 'label');
        });
    });

    module('getRecordName', function () {
        test('it prefers the configured model name path', function (assert) {
            this.service.initialize('widget', { modelNamePath: 'label' });
            const record = this.store.createRecord('widget', { label: 'Labelled', name: 'Named' });

            assert.strictEqual(this.service.getRecordName(record), 'Labelled');
        });

        test('it falls back through name, display_name and public_id', function (assert) {
            this.service.initialize('widget', { modelNamePath: 'missing' });

            assert.strictEqual(this.service.getRecordName(this.store.createRecord('widget', { name: 'Named' })), 'Named');
            assert.strictEqual(this.service.getRecordName(this.store.createRecord('widget', { display_name: 'Displayed' })), 'Displayed');
            assert.strictEqual(this.service.getRecordName(this.store.createRecord('widget', { public_id: 'PUB-1' })), 'PUB-1');
        });

        test('with nothing else to go on it falls back to the model name', function (assert) {
            this.service.initialize('widget', { modelNamePath: 'missing' });

            assert.strictEqual(this.service.getRecordName(this.store.createRecord('widget', {})), 'widget');
        });
    });

    module('permissions', function () {
        test('the permission getters compose prefix, verb and model', function (assert) {
            this.service.initialize('widget');

            assert.strictEqual(this.service.createPermission, 'fleet-ops create widget');
            assert.strictEqual(this.service.savePermission, 'fleet-ops update widget');
            assert.strictEqual(this.service.deletePermission, 'fleet-ops delete widget');
            assert.strictEqual(this.service.viewPermission, 'fleet-ops view widget');
        });

        test('they follow a custom permission prefix', function (assert) {
            this.service.initialize('widget', { permissionPrefix: 'storefront' });

            assert.strictEqual(this.service.createPermission, 'storefront create widget');
        });

        test('can asks the abilities service with the composed permission', function (assert) {
            this.service.initialize('widget');

            assert.true(this.service.can('view'));
            assert.deepEqual(this.abilityChecks, ['fleet-ops view widget']);
        });

        test('can accepts an explicit resource', function (assert) {
            this.service.initialize('widget');

            this.service.can('view', 'order');

            assert.deepEqual(this.abilityChecks, ['fleet-ops view order']);
        });

        test('cannot is the inverse of can', function (assert) {
            this.service.initialize('widget');

            this.allowed = false;
            assert.false(this.service.can('view'));
            assert.true(this.service.cannot('view'));

            this.allowed = true;
            assert.false(this.service.cannot('view'));
        });
    });

    module('createNewInstance', function () {
        test('it creates a record of the configured model', function (assert) {
            this.service.initialize('widget');

            const record = this.service.createNewInstance({ name: 'New' });

            assert.strictEqual(record.constructor.modelName, 'widget');
            assert.strictEqual(record.name, 'New');
        });

        test('it applies the default attributes', function (assert) {
            this.service.initialize('widget', { defaultAttributes: { name: 'Default' } });

            assert.strictEqual(this.service.createNewInstance().name, 'Default');
        });

        test('supplied attributes win over the defaults', function (assert) {
            this.service.initialize('widget', { defaultAttributes: { name: 'Default' } });

            assert.strictEqual(this.service.createNewInstance({ name: 'Explicit' }).name, 'Explicit');
        });
    });

    module('router resolution', function () {
        test('it prefers the host router when an engine provides one', function (assert) {
            const hostRouter = Service.extend().create();
            this.owner.register('service:host-router', hostRouter, { instantiate: false });

            assert.strictEqual(this.service.router, hostRouter);
            assert.strictEqual(this.service.hostRouter, hostRouter, 'hostRouter aliases router');
        });

        test('it falls back to the application router', function (assert) {
            assert.strictEqual(this.service.router, this.owner.lookup('service:router'));
        });
    });
});

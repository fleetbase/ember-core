import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * ReportActionsService is a thin configuration of ResourceActionService: it
 * initializes itself for the `report` model and builds the panel and modal
 * options for creating, editing and viewing one.
 */
class ReportModel extends Model {
    @attr('string') name;
    @attr() query_config;
}

module('Unit | Service | report-actions', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.opened = [];
        this.shown = [];
        const testContext = this;

        this.owner.register(
            'service:resource-context-panel',
            class extends Service {
                open(options) {
                    testContext.opened.push(options);
                    return options;
                }
            }
        );

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                show(template, options) {
                    testContext.shown.push({ template, options });
                    return options;
                }
            }
        );

        for (const name of ['abilities', 'notifications', 'intl', 'crud', 'fetch', 'current-user', 'table-context', 'universe', 'events']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('model:report', ReportModel);
        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:report-actions');
    });

    module('configuration', function () {
        test('it initializes itself for the report model', function (assert) {
            assert.strictEqual(this.service.modelName, 'report');
        });

        test('it inherits the base permission and mount prefixes', function (assert) {
            assert.strictEqual(this.service.permissionPrefix, 'fleet-ops');
            assert.strictEqual(this.service.mountPrefix, 'console.fleet-ops');
            assert.strictEqual(this.service.createPermission, 'fleet-ops create report');
        });

        test('a new report starts with an empty query config', function (assert) {
            assert.deepEqual(this.service.createNewInstance().query_config, {});
        });

        test('supplied attributes win over the default query config', function (assert) {
            const report = this.service.createNewInstance({ query_config: { filter: 'x' } });

            assert.deepEqual(report.query_config, { filter: 'x' });
        });
    });

    module('panel', function () {
        test('create opens the report form with a new record', function (assert) {
            const options = this.service.panel.create({ name: 'Weekly' });

            assert.strictEqual(options.content, 'report/form');
            assert.strictEqual(options.title, 'Create a new report');
            assert.strictEqual(options.panelContentClass, 'px-4');
            assert.strictEqual(options.report.name, 'Weekly');
            assert.strictEqual(options.report.constructor.modelName, 'report');
        });

        test('create wires the refresh callback into the save options', function (assert) {
            assert.strictEqual(this.service.panel.create().saveOptions.callback, this.service.refresh);
        });

        test('edit titles the panel after the report and reuses the record', function (assert) {
            const report = this.store.createRecord('report', { name: 'Weekly' });

            const options = this.service.panel.edit(report);

            assert.strictEqual(options.title, 'Edit: Weekly');
            assert.strictEqual(options.report, report);
        });

        test('view opens an overview tab rather than a form', function (assert) {
            const report = this.store.createRecord('report', { name: 'Weekly' });

            const options = this.service.panel.view(report);

            assert.strictEqual(options.report, report);
            assert.strictEqual(options.content, undefined, 'view has no form content');
            assert.deepEqual(options.tabs, [{ label: 'Overview', component: 'report/details', contentClass: 'p-4' }]);
        });

        test('caller options override the defaults on every panel builder', function (assert) {
            const report = this.store.createRecord('report', { name: 'Weekly' });

            assert.strictEqual(this.service.panel.create({}, { title: 'A' }).title, 'A');
            assert.strictEqual(this.service.panel.edit(report, { title: 'B' }).title, 'B');
            assert.deepEqual(this.service.panel.view(report, { tabs: [] }).tabs, []);
        });
    });

    module('modal', function () {
        test('create shows the resource modal with a new report', function (assert) {
            this.service.modal.create({ name: 'Weekly' });

            const { template, options } = this.shown[0];
            assert.strictEqual(template, 'modals/resource');
            assert.strictEqual(options.title, 'Create a new report');
            assert.strictEqual(options.acceptButtonText, 'Create report');
            assert.strictEqual(options.component, 'report/form');
            assert.strictEqual(options.resource.name, 'Weekly');
        });

        test('edit titles the modal after the report and offers a save button', function (assert) {
            const report = this.store.createRecord('report', { name: 'Weekly' });

            this.service.modal.edit(report);

            const { options } = this.shown[0];
            assert.strictEqual(options.title, 'Edit: Weekly');
            assert.strictEqual(options.acceptButtonText, 'Save Changes');
            assert.strictEqual(options.saveButtonIcon, 'save');
            assert.strictEqual(options.resource, report);
        });

        test('view shows the details component under the report name', function (assert) {
            const report = this.store.createRecord('report', { name: 'Weekly' });

            this.service.modal.view(report);

            const { options } = this.shown[0];
            assert.strictEqual(options.title, 'Weekly');
            assert.strictEqual(options.component, 'report/details');
            assert.strictEqual(options.acceptButtonText, undefined, 'view is not a save flow');
        });

        test('confirm hands the modal to the save task', function (assert) {
            const performed = [];
            this.service.modalTask.perform = (...args) => performed.push(args);

            this.service.modal.create();
            this.shown[0].options.confirm('the-modal');

            const [modal, taskName, record, saveOptions] = performed[0];
            assert.strictEqual(modal, 'the-modal');
            assert.strictEqual(taskName, 'saveTask');
            assert.strictEqual(record.constructor.modelName, 'report');
            assert.true(saveOptions.refresh);
        });

        test('extra save options reach the save task', function (assert) {
            const performed = [];
            this.service.modalTask.perform = (...args) => performed.push(args);

            this.service.modal.create({}, {}, { silent: true });
            this.shown[0].options.confirm('the-modal');

            assert.true(performed[0][3].silent);
        });

        test('caller options override the defaults', function (assert) {
            this.service.modal.create({}, { title: 'Custom title' });

            assert.strictEqual(this.shown[0].options.title, 'Custom title');
        });
    });
});

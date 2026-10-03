import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * The @action layer of ResourceActionService: the convenience methods a
 * controller calls. Each either performs a task or opens a modal whose confirm
 * callback does the work, so the tasks' `perform` and a stubbed modals manager
 * are the seams — the same shape already used for crud.
 *
 * An earlier pass skipped these as "driven through modals and the network".
 * That was too pessimistic: the modal is precisely the seam.
 */
class WidgetModel extends Model {
    @attr('string') name;
}

module('Unit | Service | resource-action (actions)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.confirmed = [];
        this.crudCalls = [];
        this.notified = [];
        this.routerCalls = [];
        this.selectedRows = [];
        this.selectedIds = [];
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                confirm(options) {
                    testContext.confirmed.push(options);
                    return Promise.resolve();
                }
            }
        );

        this.owner.register(
            'service:crud',
            class extends Service {
                bulkDelete(...args) {
                    testContext.crudCalls.push({ method: 'bulkDelete', args });
                    return 'bulk-delete-result';
                }
                export(...args) {
                    testContext.crudCalls.push({ method: 'export', args });
                    return 'export-result';
                }
                import(...args) {
                    testContext.crudCalls.push({ method: 'import', args });
                    return 'import-result';
                }
            }
        );

        this.owner.register(
            'service:intl',
            class extends Service {
                t(key, params = {}) {
                    return `${key}:${JSON.stringify(params)}`;
                }
            }
        );

        this.owner.register(
            'service:notifications',
            class extends Service {
                serverError(error) {
                    testContext.notified.push(error);
                }
            }
        );

        this.owner.register(
            'service:table-context',
            class extends Service {
                getSelectedRows() {
                    return testContext.selectedRows;
                }
                getSelectedIds() {
                    return testContext.selectedIds;
                }
                untoggleSelectAll() {
                    testContext.crudCalls.push({ method: 'untoggleSelectAll', args: [] });
                }
            }
        );

        this.owner.register(
            'service:router',
            class extends Service {
                refresh(...args) {
                    testContext.routerCalls.push({ method: 'refresh', args });
                    return 'refreshed';
                }
                transitionTo(...args) {
                    testContext.routerCalls.push({ method: 'transitionTo', args });
                    return 'transitioned';
                }
            }
        );

        for (const name of ['abilities', 'fetch', 'current-user', 'resource-context-panel', 'universe', 'events']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:resource-action');
        this.service.initialize('widget');

        // Tasks are getter-only, so the seam is each task's `perform`.
        this.performed = [];
        for (const task of ['createTask', 'updateTask', 'deleteTask', 'searchTask']) {
            this.service[task].perform = (...args) => {
                this.performed.push({ task, args });
                return Promise.resolve(`${task}-result`);
            };
        }

        this.modal = { startLoading: () => {}, stopLoading: () => {}, done: () => {} };
        this.lastConfirm = () => this.confirmed.at(-1);
    });

    module('task shortcuts', function () {
        test('create performs the create task', async function (assert) {
            const result = await this.service.create({ name: 'A' }, { silent: true });

            assert.deepEqual(this.performed, [{ task: 'createTask', args: [{ name: 'A' }, { silent: true }] }]);
            assert.strictEqual(result, 'createTask-result');
        });

        test('update performs the update task', async function (assert) {
            const record = this.store.createRecord('widget', {});

            await this.service.update(record, { silent: true });

            assert.deepEqual(this.performed, [{ task: 'updateTask', args: [record, { silent: true }] }]);
        });

        test('search performs the search task', async function (assert) {
            await this.service.search('query', { limit: 5 });

            assert.deepEqual(this.performed, [{ task: 'searchTask', args: ['query', { limit: 5 }] }]);
        });

        test('the shortcuts default their options', async function (assert) {
            await this.service.create();

            assert.deepEqual(this.performed[0].args, [{}, {}]);
        });
    });

    module('delete', function () {
        test('it opens a confirmation naming the record', function (assert) {
            const record = this.store.createRecord('widget', { name: 'Widget A' });

            this.service.delete(record);

            const options = this.lastConfirm();
            assert.true(options.title.includes('common.delete-resource-named'));
            assert.true(options.title.includes('Widget A'), 'the record name is interpolated');
            assert.strictEqual(options.acceptButtonType, 'danger');
            assert.strictEqual(options.acceptButtonIcon, 'trash');
        });

        test('confirming performs the delete task and closes the modal', async function (assert) {
            const record = this.store.createRecord('widget', { name: 'Widget A' });
            let done = 0;
            this.service.delete(record);

            await this.lastConfirm().confirm({ ...this.modal, done: () => (done += 1) });

            assert.deepEqual(this.performed, [{ task: 'deleteTask', args: [record, {}] }]);
            assert.strictEqual(done, 1);
        });

        test('delete options reach the task', async function (assert) {
            const record = this.store.createRecord('widget', {});
            this.service.delete(record, {}, { force: true });

            await this.lastConfirm().confirm(this.modal);

            assert.deepEqual(this.performed[0].args[1], { force: true });
        });

        test('taskOptions on the options argument win over the third argument', async function (assert) {
            const record = this.store.createRecord('widget', {});
            this.service.delete(record, { taskOptions: { force: false } }, { force: true });

            await this.lastConfirm().confirm(this.modal);

            assert.deepEqual(this.performed[0].args[1], { force: false });
        });

        test('a failed delete reports the error and reopens the modal', async function (assert) {
            const record = this.store.createRecord('widget', {});
            const boom = new Error('nope');
            this.service.deleteTask.perform = () => Promise.reject(boom);
            let stopped = 0;
            this.service.delete(record);

            await this.lastConfirm().confirm({ ...this.modal, stopLoading: () => (stopped += 1) });

            assert.deepEqual(this.notified, [boom]);
            assert.strictEqual(stopped, 1);
        });

        test('caller options override the modal defaults', function (assert) {
            const record = this.store.createRecord('widget', {});

            this.service.delete(record, { title: 'Custom title' });

            assert.strictEqual(this.lastConfirm().title, 'Custom title');
        });
    });

    module('confirmContinueWithUnsavedChanges', function () {
        test('confirming rolls the record back', async function (assert) {
            let rolled = 0;
            const model = { rollbackAttributes: () => (rolled += 1) };

            this.service.confirmContinueWithUnsavedChanges(model);
            await this.lastConfirm().confirm();

            assert.strictEqual(rolled, 1);
            assert.deepEqual(this.routerCalls, [], 'and stays put without a redirect');
        });

        test('a redirect target is transitioned to with the model', async function (assert) {
            const model = { rollbackAttributes: () => {} };

            this.service.confirmContinueWithUnsavedChanges(model, { redirectTo: 'console.widgets' });
            await this.lastConfirm().confirm();

            assert.deepEqual(this.routerCalls, [{ method: 'transitionTo', args: ['console.widgets', model] }]);
        });
    });

    module('bulkDelete', function () {
        test('it merges the passed selection with the table selection', function (assert) {
            const passed = this.store.createRecord('widget', {});
            const fromTable = this.store.createRecord('widget', {});
            this.selectedRows = [fromTable];

            this.service.bulkDelete([passed]);

            assert.deepEqual(this.crudCalls[0].args[0], [passed, fromTable]);
        });

        test('a non-array selection is tolerated', function (assert) {
            const fromTable = this.store.createRecord('widget', {});
            this.selectedRows = [fromTable];

            this.service.bulkDelete(null);

            assert.deepEqual(this.crudCalls[0].args[0], [fromTable]);
        });

        test('the accept button names the pluralized resource', function (assert) {
            this.service.bulkDelete([]);

            assert.true(this.crudCalls[0].args[1].acceptButtonText.includes('Widgets'));
        });

        test('global bulk delete options are merged in', function (assert) {
            this.service.bulkDeleteOptions = { actionPath: 'widgets/bulk' };

            this.service.bulkDelete([]);

            assert.strictEqual(this.crudCalls[0].args[1].actionPath, 'widgets/bulk');
        });

        test('global fetch options are used when none are supplied', function (assert) {
            this.service.fetchOptions = { headers: { 'X-A': '1' } };

            this.service.bulkDelete([]);

            assert.deepEqual(this.crudCalls[0].args[1].fetchOptions, { headers: { 'X-A': '1' } });
        });

        test('success refreshes the route and clears the selection', async function (assert) {
            this.service.bulkDelete([]);

            await this.crudCalls[0].args[1].onSuccess();

            assert.deepEqual([this.routerCalls[0].method, this.crudCalls.at(-1).method], ['refresh', 'untoggleSelectAll'], 'the table is only cleared after the refresh');
        });
    });

    module('export', function () {
        test('it merges the passed selections with the table selection', function (assert) {
            this.selectedIds = ['id-2'];

            this.service.export(['id-1']);

            assert.deepEqual(this.crudCalls[0].args[1].params.selections, ['id-1', 'id-2']);
        });

        test('it exports the configured model', function (assert) {
            this.service.export([]);

            assert.strictEqual(this.crudCalls[0].args[0], 'widget');
        });

        test('global export options are merged in', function (assert) {
            this.service.exportOptions = { exportEndpoint: 'widgets/export' };

            this.service.export([]);

            assert.strictEqual(this.crudCalls[0].args[1].exportEndpoint, 'widgets/export');
        });
    });

    module('import', function () {
        test('it imports the configured model', function (assert) {
            this.service.import();

            assert.strictEqual(this.crudCalls[0].method, 'import');
            assert.strictEqual(this.crudCalls[0].args[0], 'widget');
        });

        test('completing an import refreshes the route', function (assert) {
            this.service.import();

            this.crudCalls[0].args[1].onImportCompleted();

            assert.deepEqual(this.routerCalls, [{ method: 'refresh', args: [] }]);
        });

        test('global import options are merged in', function (assert) {
            this.service.importOptions = { importEndpoint: 'widgets/import' };

            this.service.import();

            assert.strictEqual(this.crudCalls[0].args[1].importEndpoint, 'widgets/import');
        });
    });

    module('routing', function () {
        test('refresh refreshes the current route', function (assert) {
            assert.strictEqual(this.service.refresh(), 'refreshed');
            assert.deepEqual(this.routerCalls, [{ method: 'refresh', args: [] }]);
        });

        test('transitionTo namespaces the route under the mount prefix', function (assert) {
            this.service.transitionTo('index');

            assert.deepEqual(this.routerCalls, [{ method: 'transitionTo', args: ['console.fleet-ops.index'] }]);
        });

        test('extra arguments are passed through', function (assert) {
            const record = this.store.createRecord('widget', {});

            this.service.transitionTo('details', record);

            assert.deepEqual(this.routerCalls[0].args, ['console.fleet-ops.details', record]);
        });

        test('the prefix follows an overridden permission prefix', function (assert) {
            this.service.initialize('widget', { permissionPrefix: 'storefront' });

            this.service.transitionTo('index');

            assert.deepEqual(this.routerCalls[0].args, ['console.storefront.index']);
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * The ember-concurrency tasks themselves, driven through the real task rather
 * than a stubbed `perform` — the sibling @action test covers the shortcuts that
 * call them.
 *
 * All five share one shape: do the work, announce success, track an event,
 * optionally refresh, optionally call back, and on failure report the error and
 * rethrow. The tests assert that shape holds for each.
 */
class WidgetModel extends Model {
    @attr('string') name;
}

module('Unit | Service | resource-action (tasks)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.notified = [];
        this.tracked = [];
        this.refreshes = 0;
        this.queries = [];
        const testContext = this;

        this.owner.register(
            'service:notifications',
            class extends Service {
                success(message) {
                    testContext.notified.push({ level: 'success', message });
                }
                serverError(error) {
                    testContext.notified.push({ level: 'error', error });
                }
            }
        );

        this.owner.register(
            'service:events',
            class extends Service {
                trackResourceCreated(record) {
                    testContext.tracked.push({ event: 'created', record });
                }
                trackResourceUpdated(record) {
                    testContext.tracked.push({ event: 'updated', record });
                }
                trackResourceDeleted(record) {
                    testContext.tracked.push({ event: 'deleted', record });
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
            'service:router',
            class extends Service {
                refresh() {
                    testContext.refreshes += 1;
                }
            }
        );

        for (const name of ['abilities', 'modals-manager', 'crud', 'fetch', 'current-user', 'table-context', 'resource-context-panel', 'universe']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.owner.register('model:widget', WidgetModel);
        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:resource-action');
        this.service.initialize('widget');

        this.saveRejects = false;
        const createRecord = this.store.createRecord.bind(this.store);
        this.store.createRecord = (...args) => {
            const record = createRecord(...args);
            this.prepare(record);
            return record;
        };

        this.prepare = (record) => {
            record.save = () => (this.saveRejects ? Promise.reject(new Error('save failed')) : Promise.resolve(record));
            record.destroyRecord = () => (this.saveRejects ? Promise.reject(new Error('delete failed')) : Promise.resolve(record));
            return record;
        };

        this.store.query = (modelName, options) => {
            this.queries.push({ modelName, options });
            return this.queryRejects ? Promise.reject(new Error('query failed')) : Promise.resolve(['a', 'b']);
        };

        this.record = (attributes = {}) => this.store.createRecord('widget', attributes);
    });

    module('createTask', function () {
        test('it creates, saves and returns the record', async function (assert) {
            const record = await this.service.createTask.perform({ name: 'Widget A' });

            assert.strictEqual(record.name, 'Widget A');
            assert.strictEqual(record.constructor.modelName, 'widget');
        });

        test('default attributes are merged under the supplied ones', async function (assert) {
            this.service.defaultAttributes = { name: 'Default' };

            assert.strictEqual((await this.service.createTask.perform()).name, 'Default');
            assert.strictEqual((await this.service.createTask.perform({ name: 'Explicit' })).name, 'Explicit');
        });

        test('it announces success and tracks the creation', async function (assert) {
            const record = await this.service.createTask.perform({ name: 'Widget A' });

            assert.strictEqual(this.notified[0].level, 'success');
            assert.true(this.notified[0].message.includes('resource-created-success-name'));
            assert.deepEqual(this.tracked, [{ event: 'created', record }]);
        });

        test('refresh is opt-in', async function (assert) {
            await this.service.createTask.perform({}, {});
            assert.strictEqual(this.refreshes, 0);

            await this.service.createTask.perform({}, { refresh: true });
            assert.strictEqual(this.refreshes, 1);
        });

        test('a callback receives the record', async function (assert) {
            const seen = [];

            const record = await this.service.createTask.perform({}, { callback: (r) => seen.push(r) });

            assert.deepEqual(seen, [record]);
        });

        test('a non-function callback is ignored', async function (assert) {
            await this.service.createTask.perform({}, { callback: 'not a function' });

            assert.strictEqual(this.notified[0].level, 'success');
        });

        test('a failed save reports the error and rethrows', async function (assert) {
            this.saveRejects = true;

            await assert.rejects(this.service.createTask.perform({}), /save failed/);

            assert.strictEqual(this.notified[0].level, 'error');
            assert.deepEqual(this.tracked, [], 'nothing is tracked for a failure');
        });
    });

    module('updateTask', function () {
        test('it saves and returns the record', async function (assert) {
            const record = this.record({ name: 'Widget A' });

            assert.strictEqual(await this.service.updateTask.perform(record), record);
        });

        test('it announces success and tracks the update', async function (assert) {
            const record = this.record({ name: 'Widget A' });

            await this.service.updateTask.perform(record);

            assert.true(this.notified[0].message.includes('resource-updated-success'));
            assert.deepEqual(this.tracked, [{ event: 'updated', record }]);
        });

        test('refresh and callback are honoured', async function (assert) {
            const seen = [];
            const record = this.record();

            await this.service.updateTask.perform(record, { refresh: true, callback: (r) => seen.push(r) });

            assert.strictEqual(this.refreshes, 1);
            assert.deepEqual(seen, [record]);
        });

        test('a failed save reports and rethrows', async function (assert) {
            this.saveRejects = true;

            await assert.rejects(this.service.updateTask.perform(this.record()), /save failed/);

            assert.strictEqual(this.notified.at(-1).level, 'error');
        });
    });

    module('saveTask', function () {
        test('a new record is announced and tracked as created', async function (assert) {
            const record = this.record({ name: 'Widget A' });

            await this.service.saveTask.perform(record);

            assert.true(this.notified[0].message.includes('created'), 'the message names the action');
            assert.deepEqual(this.tracked, [{ event: 'created', record }]);
        });

        test('an existing record is announced and tracked as updated', async function (assert) {
            const record = this.prepare(this.store.push({ data: { id: 'widget-1', type: 'widget', attributes: { name: 'Widget A' } } }));

            await this.service.saveTask.perform(record);

            assert.true(this.notified[0].message.includes('updated'));
            assert.deepEqual(this.tracked, [{ event: 'updated', record }]);
        });

        test('refresh and callback are honoured', async function (assert) {
            const seen = [];

            await this.service.saveTask.perform(this.record(), { refresh: true, callback: (r) => seen.push(r) });

            assert.strictEqual(this.refreshes, 1);
            assert.strictEqual(seen.length, 1);
        });

        test('a failed save reports and rethrows', async function (assert) {
            this.saveRejects = true;

            await assert.rejects(this.service.saveTask.perform(this.record()), /save failed/);

            assert.strictEqual(this.notified.at(-1).level, 'error');
        });
    });

    module('deleteTask', function () {
        test('it destroys the record and announces it', async function (assert) {
            const record = this.record({ name: 'Widget A' });

            const result = await this.service.deleteTask.perform(record);

            assert.strictEqual(result, record);
            assert.true(this.notified[0].message.includes('resource-deleted'));
            assert.deepEqual(this.tracked, [{ event: 'deleted', record }]);
        });

        test('refresh and callback are honoured', async function (assert) {
            const seen = [];

            await this.service.deleteTask.perform(this.record(), { refresh: true, callback: (r) => seen.push(r) });

            assert.strictEqual(this.refreshes, 1);
            assert.strictEqual(seen.length, 1);
        });

        test('a failed delete reports and rethrows', async function (assert) {
            this.saveRejects = true;

            await assert.rejects(this.service.deleteTask.perform(this.record()), /delete failed/);

            assert.strictEqual(this.notified.at(-1).level, 'error');
        });
    });

    module('searchTask', function () {
        test('an empty query short-circuits without querying', async function (assert) {
            assert.deepEqual(await this.service.searchTask.perform(''), []);
            assert.deepEqual(await this.service.searchTask.perform(null), []);
            assert.deepEqual(this.queries, []);
        });

        test('it queries the configured model with the term', async function (assert) {
            const results = await this.service.searchTask.perform('widget', { debounceMs: 0 });

            assert.deepEqual(results, ['a', 'b']);
            assert.strictEqual(this.queries[0].modelName, 'widget');
            assert.strictEqual(this.queries[0].options.query, 'widget');
        });

        test('the result limit defaults to ten and is configurable', async function (assert) {
            await this.service.searchTask.perform('widget', { debounceMs: 0 });
            assert.strictEqual(this.queries[0].options.limit, 10);

            await this.service.searchTask.perform('widget', { debounceMs: 0, limit: 25 });
            assert.strictEqual(this.queries.at(-1).options.limit, 25);
        });

        test('extra params are merged into the query', async function (assert) {
            await this.service.searchTask.perform('widget', { debounceMs: 0, params: { status: 'active' } });

            assert.strictEqual(this.queries[0].options.status, 'active');
        });

        test('a failed query reports and rethrows', async function (assert) {
            this.queryRejects = true;

            await assert.rejects(this.service.searchTask.perform('widget', { debounceMs: 0 }), /query failed/);

            assert.strictEqual(this.notified.at(-1).level, 'error');
        });
    });

    module('modalTask', function () {
        test('it performs the named task and returns its result', async function (assert) {
            const modal = { startLoading: () => {}, stopLoading: () => {} };
            const record = this.record({ name: 'Widget A' });

            const result = await this.service.modalTask.perform(modal, 'updateTask', record);

            assert.strictEqual(result, record);
        });

        test('it brackets the work with the modal loading state', async function (assert) {
            const order = [];
            const modal = { startLoading: () => order.push('start'), stopLoading: () => order.push('stop') };

            await this.service.modalTask.perform(modal, 'updateTask', this.record());

            assert.deepEqual(order, ['start', 'stop']);
        });

        test('an unknown task name does nothing at all', async function (assert) {
            const order = [];
            const modal = { startLoading: () => order.push('start'), stopLoading: () => order.push('stop') };

            const result = await this.service.modalTask.perform(modal, 'noSuchTask');

            assert.strictEqual(result, undefined);
            assert.deepEqual(order, [], 'the modal is never even put into loading');
        });

        test('a failing inner task is swallowed but still stops the loader', async function (assert) {
            this.saveRejects = true;
            const order = [];
            const modal = { startLoading: () => order.push('start'), stopLoading: () => order.push('stop') };

            const result = await this.service.modalTask.perform(modal, 'updateTask', this.record());

            assert.strictEqual(result, undefined, 'the error does not propagate to the caller');
            assert.deepEqual(order, ['start', 'stop'], 'stopLoading is in a finally');
        });
    });

    module('controllerSearchTask', function () {
        test('an empty value clears the query', async function (assert) {
            const controller = { query: 'previous', page: 3 };

            await this.service.controllerSearchTask.perform(controller, { target: { value: '' } });

            assert.strictEqual(controller.query, null);
            assert.strictEqual(controller.page, 3, 'and leaves the page alone');
        });

        test('a value sets the query and resets the page', async function (assert) {
            const controller = { query: null, page: 3 };

            await this.service.controllerSearchTask.perform(controller, { target: { value: 'widget' } });

            assert.strictEqual(controller.query, 'widget');
            assert.strictEqual(controller.page, 1);
        });

        test('a page already at one is left alone', async function (assert) {
            const controller = { query: null, page: 1 };

            await this.service.controllerSearchTask.perform(controller, { target: { value: 'widget' } });

            assert.strictEqual(controller.page, 1);
        });
    });
});

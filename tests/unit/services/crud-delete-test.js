import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * `delete` opens a confirmation modal and does the work in its confirm
 * callback; `bulkDelete` is a thin configuration of `bulkAction`.
 *
 * The modals manager is stubbed so the confirm callback can be invoked
 * directly — that callback is where all the behaviour lives.
 */
class OrderModel extends Model {
    @attr('string') name;
}

module('Unit | Service | crud (delete)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.confirmed = [];
        this.notified = [];
        this.tracked = [];
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                confirm(options) {
                    testContext.confirmed.push(options);
                    return Promise.resolve();
                }
                show(template, options) {
                    testContext.confirmed.push({ template, ...options });
                    return Promise.resolve();
                }
                setOption() {}
                getOption() {
                    return null;
                }
            }
        );

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
                trackResourceDeleted(model) {
                    testContext.tracked.push(model);
                }
            }
        );

        this.owner.register('service:fetch', class extends Service {});
        this.owner.register('service:current-user', class extends Service {});
        this.owner.register('service:universe', class extends Service {});
        this.owner.register('model:order', OrderModel);

        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:crud');

        this.record = (attributes = {}) => {
            const record = this.store.createRecord('order', attributes);
            record.destroyRecord = () => {
                record.destroyed = true;
                return Promise.resolve('destroyed');
            };
            return record;
        };

        this.modal = { startLoading: () => {} };
        this.lastConfirm = () => this.confirmed.at(-1);
    });

    module('the confirmation modal', function () {
        test('it names the model in the title', function (assert) {
            this.service.delete(this.record({ name: 'Order A' }));

            assert.strictEqual(this.lastConfirm().title, 'Are you sure to delete this Order?');
        });

        test('a supplied model name overrides the derived one', function (assert) {
            this.service.delete(this.record(), { modelName: 'fuel_report' });

            assert.strictEqual(this.lastConfirm().title, 'Are you sure to delete this Fuel Report?');
        });

        test('the model is handed to the modal', function (assert) {
            const record = this.record({ name: 'Order A' });

            this.service.delete(record);

            assert.strictEqual(this.lastConfirm().model, record);
            assert.deepEqual(this.lastConfirm().args, ['model']);
        });

        test('caller options are merged in', function (assert) {
            this.service.delete(this.record(), { acceptButtonText: 'Yes, delete' });

            assert.strictEqual(this.lastConfirm().acceptButtonText, 'Yes, delete');
        });
    });

    module('confirming', function () {
        test('it destroys the record and reports success', async function (assert) {
            const record = this.record({ name: 'Order A' });
            this.service.delete(record);

            const response = await this.lastConfirm().confirm(this.modal);

            assert.true(record.destroyed);
            assert.strictEqual(response, 'destroyed');
            assert.deepEqual(this.notified, [{ level: 'success', message: "Order 'Order A' has been deleted." }]);
        });

        test('a record with no name is described by its model name alone', async function (assert) {
            this.service.delete(this.record());

            await this.lastConfirm().confirm(this.modal);

            assert.strictEqual(this.notified[0].message, "'Order' has been deleted.");
        });

        test('a custom success notification is used verbatim', async function (assert) {
            this.service.delete(this.record({ name: 'Order A' }), { successNotification: 'Gone.' });

            await this.lastConfirm().confirm(this.modal);

            assert.strictEqual(this.notified[0].message, 'Gone.');
        });

        test('the deletion is tracked', async function (assert) {
            const record = this.record();
            this.service.delete(record);

            await this.lastConfirm().confirm(this.modal);

            assert.deepEqual(this.tracked, [record]);
        });

        test('the lifecycle hooks fire in order', async function (assert) {
            const order = [];
            const record = this.record();
            this.service.delete(record, {
                onTrigger: () => order.push('trigger'),
                onSuccess: () => order.push('success'),
                callback: () => order.push('callback'),
            });

            await this.lastConfirm().confirm(this.modal);

            assert.deepEqual(order, ['trigger', 'success', 'callback']);
        });

        test('a failed deletion reports the error and skips onSuccess', async function (assert) {
            const boom = new Error('nope');
            const record = this.record();
            record.destroyRecord = () => Promise.reject(boom);
            const order = [];

            this.service.delete(record, {
                onSuccess: () => order.push('success'),
                onError: (error) => order.push(error),
                callback: () => order.push('callback'),
            });
            await this.lastConfirm().confirm(this.modal);

            assert.deepEqual(this.notified, [{ level: 'error', error: boom }]);
            assert.deepEqual(order, [boom, 'callback'], 'onError then callback; onSuccess never runs');
        });

        test('the callback runs even when the deletion fails', async function (assert) {
            const record = this.record();
            record.destroyRecord = () => Promise.reject(new Error('nope'));
            let called = false;

            this.service.delete(record, { callback: () => (called = true) });
            await this.lastConfirm().confirm(this.modal);

            assert.true(called, 'it is in a finally block');
        });

        test('non-function hooks are ignored', async function (assert) {
            const record = this.record();
            this.service.delete(record, { onTrigger: 'no', onSuccess: 'no', callback: 'no' });

            await this.lastConfirm().confirm(this.modal);

            assert.true(record.destroyed, 'the deletion still happened');
        });

        test('the modal is put into a loading state', async function (assert) {
            let loading = 0;
            this.service.delete(this.record());

            await this.lastConfirm().confirm({ startLoading: () => (loading += 1) });

            assert.strictEqual(loading, 1);
        });
    });

    module('bulkDelete', function () {
        test('it does nothing without a selection', function (assert) {
            assert.strictEqual(this.service.bulkDelete([]), undefined);
            assert.strictEqual(this.service.bulkDelete(null), undefined);
            assert.deepEqual(this.confirmed, []);
        });

        test('it configures a danger-styled bulk action', function (assert) {
            this.service.bulkDelete([this.record({ name: 'A' })]);

            const options = this.lastConfirm();
            assert.strictEqual(options.acceptButtonScheme, 'danger');
            assert.strictEqual(options.acceptButtonIcon, 'trash');
            assert.strictEqual(options.actionMethod, 'DELETE');
            assert.strictEqual(options.actionPath, 'orders/bulk-delete');
        });

        test('the action path is derived from the model name', function (assert) {
            this.service.bulkDelete([this.record()], { modelName: 'fuel_report' });

            assert.strictEqual(this.lastConfirm().actionPath, 'fuel-reports/bulk-delete');
        });

        test('records of a different type are dropped from the selection', function (assert) {
            this.owner.register('model:vehicle', class extends Model {});
            const order = this.record();
            const vehicle = this.store.createRecord('vehicle', {});

            this.service.bulkDelete([order, vehicle]);

            assert.deepEqual(this.lastConfirm().selected, [order], 'a bulk endpoint only accepts one model type');
        });

        test('caller options override the defaults', function (assert) {
            this.service.bulkDelete([this.record()], { acceptButtonScheme: 'primary' });

            assert.strictEqual(this.lastConfirm().acceptButtonScheme, 'primary');
        });
    });
});

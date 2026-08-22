import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * The half of bulkAction that actually performs the action. The sibling test
 * covers opening the modal and editing the selection; this one drives the
 * `confirm` callback the modal invokes.
 *
 * The seam is the same one crud.delete uses — the stubbed modals manager holds
 * the options, and `confirm` is called with a modal stand-in that reads from it.
 * Everything the callback touches (fetch.request, notifications, events) is a
 * registered stub, so nothing reaches the network.
 *
 * Real store records are used rather than plain objects wearing a fake
 * `constructor.modelName`: getModelName tests with `instanceof Model`, so a
 * stand-in resolves to an empty model name and every message built from it
 * comes out blank.
 */
class OrderModel extends Model {
    @attr('string') name;
}

module('Unit | Service | crud (bulkAction confirm)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        // The catch branch logs before notifying; the console noise is not the
        // subject of these tests. Saved before anything that can throw, so a
        // failing hook cannot leave afterEach restoring `undefined`.
        this.originalConsoleError = console.error;
        console.error = () => {};

        this.shown = [];
        this.requests = [];
        this.notified = [];
        this.tracked = [];
        this.requestRejects = false;
        this.response = { message: null };
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                show(template, options) {
                    testContext.shown.push({ template, options });
                    this.options = options;
                    return Promise.resolve();
                }
                setOption(key, value) {
                    this.options[key] = value;
                }
                getOption(key, fallback = null) {
                    return this.options?.[key] ?? fallback;
                }
            }
        );

        this.owner.register(
            'service:fetch',
            class extends Service {
                request(...args) {
                    testContext.requests.push(args);
                    if (testContext.requestRejects) {
                        return Promise.reject(new Error('bulk action failed'));
                    }
                    return Promise.resolve(testContext.response);
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
                trackBulkAction(verb, selected) {
                    testContext.tracked.push({ verb, selected });
                }
            }
        );

        this.owner.register('service:current-user', class extends Service {});
        this.owner.register('service:universe', class extends Service {});
        this.owner.register('model:order', OrderModel);

        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:crud');
        this.record = (id, name) => this.store.createRecord('order', { id, name });
        this.modals = this.owner.lookup('service:modals-manager');
        this.lastOptions = () => this.shown.at(-1).options;

        this.loading = [];
        this.modal = {
            startLoading: () => this.loading.push('start'),
            stopLoading: () => this.loading.push('stop'),
            getOption: (key, fallback) => this.modals.getOption(key, fallback),
            setOption: (key, value) => this.modals.setOption(key, value),
        };
    });

    hooks.afterEach(function () {
        if (typeof this.originalConsoleError === 'function') {
            console.error = this.originalConsoleError;
        }
    });

    module('the request', function () {
        test('it posts the selected ids to the action path', async function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A'), this.record('2', 'B')], { actionPath: 'orders/bulk-archive' });

            await this.lastOptions().confirm(this.modal);

            const [path, method, body] = this.requests[0];
            assert.strictEqual(path, 'orders/bulk-archive');
            assert.strictEqual(method, 'post', 'the default verb');
            assert.deepEqual(JSON.parse(body.body), { ids: ['1', '2'] });
        });

        test('an explicit action method is lowercased', async function (assert) {
            this.service.bulkAction('delete', [this.record('1', 'A')], { actionPath: 'orders/bulk-delete', actionMethod: 'DELETE' });

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.requests[0][1], 'delete');
        });

        test('a non-string action method falls back to post', async function (assert) {
            this.service.bulkAction('delete', [this.record('1', 'A')], { actionMethod: 42 });

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.requests[0][1], 'post');
        });

        test('fetch params from the modal are merged into the body', async function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A')]);
            this.modals.setOption('fetchParams', { reason: 'cleanup' });

            await this.lastOptions().confirm(this.modal);

            assert.deepEqual(JSON.parse(this.requests[0][2].body), { ids: ['1'], reason: 'cleanup' });
        });

        test('fetch options from the modal are passed through', async function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A')]);
            this.modals.setOption('fetchOptions', { headers: { 'X-A': '1' } });

            await this.lastOptions().confirm(this.modal);

            assert.deepEqual(this.requests[0][3], { headers: { 'X-A': '1' } });
        });

        test('it sends whatever is selected at confirm time, not at open time', async function (assert) {
            const [first, second] = [this.record('1', 'A'), this.record('2', 'B')];
            this.service.bulkAction('archive', [first, second]);

            this.lastOptions().remove(first);
            await this.lastOptions().confirm(this.modal);

            assert.deepEqual(JSON.parse(this.requests[0][2].body).ids, ['2'], 'rows dropped in the modal are not submitted');
        });

        test('the modal is put into a loading state before the request', async function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A')]);

            await this.lastOptions().confirm(this.modal);

            assert.deepEqual(this.loading, ['start']);
        });
    });

    module('success', function () {
        test('it reports the server message when there is one', async function (assert) {
            this.response = { message: 'Two orders archived.' };
            this.service.bulkAction('archive', [this.record('1', 'A'), this.record('2', 'B')]);

            await this.lastOptions().confirm(this.modal);

            assert.deepEqual(this.notified, [{ level: 'success', message: 'Two orders archived.' }]);
        });

        test('the default success message repeats the count', async function (assert) {
            // Pinned, not fixed. The message is built as
            //   `${count} ${pluralize(count, modelName)} were updated successfully.`
            // but ember-inflector's pluralize(count, word) ALREADY returns
            // "<count> <word>", so the count is interpolated twice.
            this.service.bulkAction('archive', [this.record('1', 'A'), this.record('2', 'B')]);

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.notified[0].message, '2 2 Orders were updated successfully.');
        });

        test('a single record is described in the singular, and still doubled', async function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A')]);

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.notified[0].message, '1 1 Order were updated successfully.');
        });

        test('a caller-supplied notification is used verbatim', async function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A')], { successNotification: 'All done.' });

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.notified[0].message, 'All done.');
        });

        test('the action is tracked with the verb and the final selection', async function (assert) {
            const [first, second] = [this.record('1', 'A'), this.record('2', 'B')];
            this.service.bulkAction('archive', [first, second]);

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.tracked.length, 1);
            assert.strictEqual(this.tracked[0].verb, 'archive');
            assert.deepEqual(this.tracked[0].selected, [first, second]);
        });

        test('onSuccess receives the selection and the response is returned', async function (assert) {
            const seen = [];
            this.response = { message: 'ok' };
            const selected = [this.record('1', 'A')];
            this.service.bulkAction('archive', selected, { onSuccess: (records) => seen.push(records) });

            const result = await this.lastOptions().confirm(this.modal);

            assert.strictEqual(seen.length, 1);
            assert.strictEqual(seen[0], selected, 'the same array the modal held');
            assert.strictEqual(result, this.response);
        });

        test('withSelected is offered the selection before the request goes out', async function (assert) {
            const order = [];
            this.service.bulkAction('archive', [this.record('1', 'A')], {
                withSelected: () => order.push('withSelected'),
            });
            const confirm = this.lastOptions().confirm;
            this.modal.startLoading = () => order.push('startLoading');

            await confirm(this.modal);

            assert.deepEqual(order, ['withSelected', 'startLoading']);
        });
    });

    module('failure', function () {
        test('the error is reported and nothing is tracked', async function (assert) {
            this.requestRejects = true;
            this.service.bulkAction('archive', [this.record('1', 'A')]);

            const result = await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.notified[0].level, 'error');
            assert.deepEqual(this.tracked, [], 'the event only fires on success');
            assert.strictEqual(result, undefined, 'the failure is swallowed rather than rethrown');
        });

        test('onError receives the error and the selection', async function (assert) {
            this.requestRejects = true;
            const seen = [];
            const selected = [this.record('1', 'A')];
            this.service.bulkAction('archive', selected, { onError: (error, records) => seen.push({ error, records }) });

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(seen[0].error.message, 'bulk action failed');
            assert.strictEqual(seen[0].records, selected);
        });

        test('onSuccess is skipped', async function (assert) {
            this.requestRejects = true;
            const seen = [];
            this.service.bulkAction('archive', [this.record('1', 'A')], { onSuccess: () => seen.push('called') });

            await this.lastOptions().confirm(this.modal);

            assert.deepEqual(seen, []);
        });
    });

    module('the callback', function () {
        test('it runs after a successful action', async function (assert) {
            const seen = [];
            const selected = [this.record('1', 'A')];
            this.service.bulkAction('archive', selected);
            this.modals.setOption('callback', (records) => seen.push(records));

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(seen.length, 1);
            assert.strictEqual(seen[0], selected);
        });

        test('it runs after a failure too', async function (assert) {
            this.requestRejects = true;
            const seen = [];
            this.service.bulkAction('archive', [this.record('1', 'A')]);
            this.modals.setOption('callback', () => seen.push('called'));

            await this.lastOptions().confirm(this.modal);

            assert.deepEqual(seen, ['called'], 'it is in a finally');
        });

        test('a non-function callback is ignored', async function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A')]);
            this.modals.setOption('callback', 'not a function');

            await this.lastOptions().confirm(this.modal);

            assert.strictEqual(this.notified[0].level, 'success', 'the action still completed');
        });
    });

    module('the modal options', function () {
        test('the title and accept button are humanized from the verb', function (assert) {
            this.service.bulkAction('archive', [this.record('1', 'A')]);

            const options = this.lastOptions();
            assert.strictEqual(options.title, 'Bulk archive Orders');
            assert.strictEqual(options.acceptButtonText, 'Archive');
        });
    });
});

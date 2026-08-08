import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * loadSubjectCustomFields, and the confirm callback on the edit modal.
 *
 * The task swallows its own failure — it logs and returns undefined rather than
 * rejecting — so the caller cannot tell a failed load from a subject with no
 * custom fields. That is asserted rather than assumed.
 */
module('Unit | Service | custom-fields-registry (tasks)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.shown = [];
        this.performed = [];
        this.loads = [];
        this.loadRejects = false;
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                show(template, options) {
                    testContext.shown.push({ template, options });
                    return Promise.resolve();
                }
                setOption() {}
                getOption() {
                    return null;
                }
            }
        );

        for (const name of ['resource-context-panel', 'notifications', 'events', 'abilities', 'fetch', 'current-user', 'table-context', 'universe', 'crud', 'router', 'intl']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:custom-fields-registry');

        // forSubject builds a real SubjectCustomFields backed by the store; the
        // task's own behaviour is what is under test, so it is stood in for.
        this.manager = {
            load(options) {
                testContext.loads.push(options);
                return testContext.loadRejects ? Promise.reject(new Error('load failed')) : Promise.resolve(testContext.manager);
            },
        };
        this.service.forSubject = (subject, options) => {
            this.forSubjectArgs = { subject, options };
            if (this.forSubjectThrows) {
                throw new Error('no subject');
            }
            return this.manager;
        };

        this.service.modalTask = {
            perform: (...args) => {
                this.performed.push(args);
                return Promise.resolve('saved');
            },
        };

        this.originalConsoleError = console.error;
        console.error = () => {};
    });

    hooks.afterEach(function () {
        console.error = this.originalConsoleError;
    });

    module('loadSubjectCustomFields', function () {
        test('it loads grouped fields and returns the manager', async function (assert) {
            const subject = { id: 'order-1' };

            const manager = await this.service.loadSubjectCustomFields.perform(subject);

            assert.strictEqual(manager, this.manager);
            assert.deepEqual(this.loads, [{ group: true }], 'always grouped');
        });

        test('the subject and options reach forSubject', async function (assert) {
            const subject = { id: 'order-1' };

            await this.service.loadSubjectCustomFields.perform(subject, { subjectType: 'order' });

            assert.strictEqual(this.forSubjectArgs.subject, subject);
            assert.deepEqual(this.forSubjectArgs.options, { subjectType: 'order' });
        });

        test('options default to an empty object', async function (assert) {
            await this.service.loadSubjectCustomFields.perform({ id: 'order-1' });

            assert.deepEqual(this.forSubjectArgs.options, {});
        });

        test('a failed load resolves with undefined rather than rejecting', async function (assert) {
            this.loadRejects = true;

            const manager = await this.service.loadSubjectCustomFields.perform({ id: 'order-1' });

            assert.strictEqual(manager, undefined, 'a caller cannot tell this from a subject with no fields');
        });

        test('a failure building the manager is swallowed the same way', async function (assert) {
            this.forSubjectThrows = true;

            assert.strictEqual(await this.service.loadSubjectCustomFields.perform({ id: 'order-1' }), undefined);
        });
    });

    module('the edit modal', function () {
        test('it opens with the field and a save button', function (assert) {
            const customField = { label: 'Delivery window' };

            this.service.modal.edit(customField);

            const { template, options } = this.shown[0];
            assert.strictEqual(template, 'modals/resource');
            assert.strictEqual(options.title, 'Edit custom field: Delivery window');
            assert.strictEqual(options.acceptButtonText, 'Save Changes');
            assert.strictEqual(options.resource, customField);
        });

        test('confirming saves the field through the modal task', async function (assert) {
            const customField = { label: 'Delivery window' };
            this.service.modal.edit(customField);
            const modal = { startLoading() {}, stopLoading() {} };

            const result = await this.shown[0].options.confirm(modal);

            assert.strictEqual(result, 'saved');
            assert.deepEqual(this.performed, [[modal, 'saveTask', customField, { refresh: true }]]);
        });

        test('save options reach the task', async function (assert) {
            const customField = { label: 'Delivery window' };
            this.service.modal.edit(customField, {}, { callback: 'mine' });

            await this.shown[0].options.confirm({});

            assert.deepEqual(this.performed[0][3], { refresh: true, callback: 'mine' });
        });

        test('saveOptions on the options argument are merged in too', async function (assert) {
            this.service.modal.edit({ label: 'X' }, { saveOptions: { silent: true } });

            await this.shown[0].options.confirm({});

            assert.deepEqual(this.performed[0][3], { refresh: true, silent: true });
        });
    });
});

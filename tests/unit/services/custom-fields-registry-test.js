import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * CustomFieldsRegistryService hands out one SubjectCustomFields manager per
 * subject-and-scope, and exposes the manager's API as service methods.
 *
 * The panel/modal builders are covered through stubbed collaborators, which
 * capture what the service asks them to render.
 */
class WidgetModel extends Model {
    @attr('string') name;
}

class CustomFieldModel extends Model {
    @attr('string') label;
    @attr('string') value_type;
}

module('Unit | Service | custom-fields-registry', function (hooks) {
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

        this.owner.register('model:widget', WidgetModel);
        this.owner.register('model:custom-field', CustomFieldModel);

        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:custom-fields-registry');
        this.subject = this.store.push({ data: { id: 'subject-1', type: 'widget', attributes: { name: 'Widget' } } });
    });

    test('it labels custom fields by their label attribute', function (assert) {
        assert.strictEqual(this.service.modelNamePath, 'label');
    });

    test('it initializes itself for the custom-field model', function (assert) {
        // Regression: the service never called `initialize`, so `modelName`
        // stayed null and every create path below reached
        // `store.createRecord(undefined)`.
        assert.strictEqual(this.service.modelName, 'custom-field');
        assert.strictEqual(this.service.createPermission, 'fleet-ops create custom-field');
    });

    module('forSubject', function () {
        test('it refuses anything that is not an object', function (assert) {
            assert.throws(() => this.service.forSubject(null), /subject must be an object/);
            assert.throws(() => this.service.forSubject('widget'), /subject must be an object/);
            assert.throws(() => this.service.forSubject([]), /subject must be an object/);
        });

        test('it builds a manager bound to the subject', function (assert) {
            const manager = this.service.forSubject(this.subject);

            assert.strictEqual(manager.subject, this.subject);
        });

        test('the same subject and scope yields the same manager', function (assert) {
            assert.strictEqual(this.service.forSubject(this.subject), this.service.forSubject(this.subject));
        });

        test('a different subject gets its own manager', function (assert) {
            const other = this.store.push({ data: { id: 'subject-2', type: 'widget', attributes: {} } });

            assert.notStrictEqual(this.service.forSubject(this.subject), this.service.forSubject(other));
        });

        test('a different scope on the same subject gets its own manager', function (assert) {
            const first = this.service.forSubject(this.subject, { groupedFor: 'group-a' });
            const second = this.service.forSubject(this.subject, { groupedFor: 'group-b' });

            assert.notStrictEqual(first, second, 'the scope key includes groupedFor');
        });

        test('the scope key also distinguishes fieldFor', function (assert) {
            const first = this.service.forSubject(this.subject, { fieldFor: 'a' });
            const second = this.service.forSubject(this.subject, { fieldFor: 'b' });

            assert.notStrictEqual(first, second);
        });

        test('nested loadOptions are read for the scope key', function (assert) {
            const first = this.service.forSubject(this.subject, { loadOptions: { groupedFor: 'group-a' } });
            const second = this.service.forSubject(this.subject, { loadOptions: { groupedFor: 'group-b' } });

            assert.notStrictEqual(first, second);
        });

        test('a cached manager has its options refreshed rather than replaced', function (assert) {
            const manager = this.service.forSubject(this.subject, { first: 1 });

            const again = this.service.forSubject(this.subject, { second: 2 });

            assert.strictEqual(again, manager, 'the same instance comes back');
            assert.deepEqual(manager.options, { first: 1, second: 2 }, 'the new options are merged in');
        });
    });

    module('getSubjectCacheKey', function () {
        test('a subject with an id is keyed by it', function (assert) {
            assert.strictEqual(this.service.getSubjectCacheKey(this.subject, {}), 'subject-1');
        });

        test('without an id it falls back to the scope', function (assert) {
            assert.strictEqual(this.service.getSubjectCacheKey({}, {}), 'custom_field_group:subject:null');
        });

        test('explicit scope options are used', function (assert) {
            assert.strictEqual(this.service.getSubjectCacheKey({}, { groupedFor: 'g', fieldFor: 'f' }), 'g:f');
        });

        test('nested loadOptions are read too', function (assert) {
            assert.strictEqual(this.service.getSubjectCacheKey({}, { loadOptions: { groupedFor: 'g', fieldFor: 'f' } }), 'g:f');
        });
    });

    module('manager proxies', function () {
        test('set stages a value on the subject manager', function (assert) {
            // Regression: this delegated to a `set` method that
            // SubjectCustomFields does not have, so it always threw.
            this.service.set(this.subject, 'field-1', 'hello', 'text');

            assert.deepEqual(this.service.forSubject(this.subject).getValue('field-1'), { value: 'hello', value_type: 'text' });
        });

        test('get reads a staged value back', function (assert) {
            // Regression: this delegated to a `get` method that
            // SubjectCustomFields does not have, so it always threw.
            this.service.set(this.subject, 'field-1', 'hello', 'text');

            assert.deepEqual(this.service.get(this.subject, 'field-1'), { value: 'hello', value_type: 'text' });
        });

        test('setProperties stages several at once', function (assert) {
            this.service.setProperties(this.subject, [{ fieldId: 'field-1', value: 'a', value_type: 'text' }]);

            assert.strictEqual(this.service.get(this.subject, 'field-1').value, 'a');
        });

        test('getProperties returns everything staged', function (assert) {
            this.service.set(this.subject, 'field-1', 'a', 'text');

            assert.deepEqual(this.service.getProperties(this.subject), { 'field-1': { value: 'a', value_type: 'text' } });
        });

        test('clear empties the manager', function (assert) {
            this.service.set(this.subject, 'field-1', 'a', 'text');

            this.service.clear(this.subject);

            assert.deepEqual(this.service.getProperties(this.subject), {});
        });

        test('serialize emits the staged values', function (assert) {
            this.service.set(this.subject, 'field-1', 'a', 'text');

            assert.deepEqual(this.service.serialize(this.subject), [{ custom_field_uuid: 'field-1', value: 'a', value_type: 'text' }]);
        });

        test('getFields and getGroups start empty', function (assert) {
            assert.deepEqual(this.service.getFields(this.subject), []);
            assert.deepEqual(this.service.getGroups(this.subject), []);
            assert.deepEqual(this.service.getGroupedFields(this.subject), []);
        });

        test('load delegates to the manager', async function (assert) {
            const queried = [];
            this.store.query = (modelName) => {
                queried.push(modelName);
                return Promise.resolve(this.store.peekAll(modelName));
            };

            await this.service.load(this.subject);

            assert.deepEqual(queried, ['category', 'custom-field']);
        });

        test('every proxy reaches the same cached manager', function (assert) {
            this.service.set(this.subject, 'field-1', 'a', 'text');

            assert.deepEqual(this.service.forSubject(this.subject).getProperties(), this.service.getProperties(this.subject));
        });
    });

    module('panel', function () {
        test('create opens the form with a new custom field', function (assert) {
            const options = this.service.panel.create({ label: 'Colour' });

            assert.strictEqual(options.content, 'custom-field/form');
            assert.strictEqual(options.title, 'Create a new custom field');
            assert.true(options.useDefaultSaveTask);
            assert.strictEqual(options.customField.label, 'Colour', 'the attributes are applied to the new record');
            assert.strictEqual(options.customField.constructor.modelName, 'custom-field');
        });

        test('create wires the refresh callback into the save options', function (assert) {
            const options = this.service.panel.create();

            assert.strictEqual(options.saveOptions.callback, this.service.refresh);
        });

        test('create lets a caller add save options without losing the callback', function (assert) {
            const marker = () => {};
            const options = this.service.panel.create({}, {}, { extra: marker });

            assert.strictEqual(options.saveOptions.extra, marker);
            assert.strictEqual(options.saveOptions.callback, this.service.refresh);
        });

        test('save options nested under the options argument are merged too', function (assert) {
            const options = this.service.panel.create({}, { saveOptions: { fromOptions: true } }, { fromArgument: true });

            assert.true(options.saveOptions.fromOptions);
            assert.true(options.saveOptions.fromArgument);
        });

        test('edit titles the panel after the field', function (assert) {
            const customField = this.store.createRecord('custom-field', { label: 'Colour' });

            const options = this.service.panel.edit(customField);

            assert.strictEqual(options.title, 'Edit: Colour');
            assert.strictEqual(options.customField, customField, 'the existing record is reused');
        });

        test('caller options override the defaults', function (assert) {
            const options = this.service.panel.create({}, { title: 'Custom title' });

            assert.strictEqual(options.title, 'Custom title');
        });
    });

    module('modal', function () {
        test('create shows the resource modal with a new field', function (assert) {
            this.service.modal.create({ label: 'Colour' });

            const { template, options } = this.shown[0];
            assert.strictEqual(template, 'modals/resource');
            assert.strictEqual(options.title, 'Create a new custom field');
            assert.strictEqual(options.acceptButtonText, 'Create Custom Field');
            assert.strictEqual(options.component, 'custom-field/form');
            assert.strictEqual(options.resource.label, 'Colour');
        });

        test('edit titles the modal after the field and offers a save button', function (assert) {
            const customField = this.store.createRecord('custom-field', { label: 'Colour' });

            this.service.modal.edit(customField);

            const { options } = this.shown[0];
            assert.strictEqual(options.title, 'Edit custom field: Colour');
            assert.strictEqual(options.acceptButtonText, 'Save Changes');
            assert.strictEqual(options.saveButtonIcon, 'save');
            assert.strictEqual(options.resource, customField);
        });

        test('confirm hands the modal to the save task', function (assert) {
            const performed = [];
            // `modalTask` is an ember-concurrency task and getter-only, so the
            // seam is its `perform`, not the property.
            this.service.modalTask.perform = (...args) => performed.push(args);

            this.service.modal.create();
            this.shown[0].options.confirm('the-modal');

            const [modal, taskName, record, saveOptions] = performed[0];
            assert.strictEqual(modal, 'the-modal');
            assert.strictEqual(taskName, 'saveTask');
            assert.strictEqual(record.constructor.modelName, 'custom-field');
            assert.true(saveOptions.refresh);
        });

        test('caller options override the defaults', function (assert) {
            this.service.modal.create({}, { title: 'Custom title' });

            assert.strictEqual(this.shown[0].options.title, 'Custom title');
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { tracked } from '@glimmer/tracking';
import Model, { attr, hasMany } from '@ember-data/model';
import SubjectCustomFields from '@fleetbase/ember-core/library/subject-custom-fields';

/**
 * saveTo's diffing: which staged values become updates, which become new
 * records, which existing records get deleted, and what happens when a save
 * rejects.
 *
 * The sibling test covers staging and validation; this one covers the write.
 * The store is real, as there — only `record.save` is stubbed, so the code
 * under test still receives genuine ember-data record arrays.
 */
class CategoryModel extends Model {
    @attr('string') name;
    @tracked customFields;
}

class CustomFieldModel extends Model {
    @attr('string') label;
    @attr('string') category_uuid;
    @attr('boolean') required;
    @attr('boolean') editable;
    @attr('string') value_type;

    get valueType() {
        return this.value_type;
    }
}

class CustomFieldValueModel extends Model {
    @attr('string') custom_field_uuid;
    @attr('string') subject_uuid;
    @attr('string') company_uuid;
    @attr('string') value;
    @attr('string') value_type;
}

class WidgetModel extends Model {
    @attr('string') company_uuid;
    @hasMany('custom-field-value', { async: false, inverse: null }) custom_field_values;
}

module('Unit | Library | subject-custom-fields (saving)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('model:category', CategoryModel);
        this.owner.register('model:custom-field', CustomFieldModel);
        this.owner.register('model:custom-field-value', CustomFieldValueModel);
        this.owner.register('model:widget', WidgetModel);

        this.store = this.owner.lookup('service:store');

        this.saved = [];
        this.saveRejects = false;
        this.prepare = (record) => {
            record.save = (options) => {
                this.saved.push({ record, options });
                return this.saveRejects ? Promise.reject(new Error('save failed')) : Promise.resolve(record);
            };
            return record;
        };

        const createRecord = this.store.createRecord.bind(this.store);
        this.store.createRecord = (...args) => this.prepare(createRecord(...args));

        this.push = (type, id, attributes = {}) => this.store.push({ data: { id, type, attributes } });

        this.queried = [];
        this.queryResult = [];
        this.queryRejects = false;
        this.store.query = (modelName, params) => {
            this.queried.push({ modelName, params });
            return this.queryRejects ? Promise.reject(new Error('query failed')) : Promise.resolve(this.queryResult);
        };

        this.subject = this.push('widget', 'subject-1', { company_uuid: 'company-1' });
        this.build = (options = {}, subject = this.subject) => new SubjectCustomFields({ owner: this.store, subject, options });
        this.manager = this.build({ saveOptions: { validate: false } });

        this.existing = (id, attributes) => this.prepare(this.push('custom-field-value', id, attributes));
    });

    module('the constructor', function () {
        test('options are optional', function (assert) {
            const manager = new SubjectCustomFields({ owner: this.store, subject: this.subject });

            assert.deepEqual(manager.options, {});
            assert.strictEqual(manager.subject, this.subject);
        });
    });

    module('creating', function () {
        test('a staged value with no existing record becomes a new one', async function (assert) {
            this.manager.setField('field-1', 'hello', 'text');

            const result = await this.manager.saveTo(this.subject);

            assert.strictEqual(result.created.length, 1);
            assert.strictEqual(result.created[0].custom_field_uuid, 'field-1');
            assert.strictEqual(result.created[0].value, 'hello');
            assert.strictEqual(result.created[0].value_type, 'text');
        });

        test('a null value is stored as an empty string', async function (assert) {
            this.manager.setField('field-1', null);

            const result = await this.manager.saveTo(this.subject);

            assert.strictEqual(result.created[0].value, '');
            assert.strictEqual(result.created[0].value_type, null);
        });

        test('nothing is persisted unless asked', async function (assert) {
            this.manager.setField('field-1', 'hello');

            await this.manager.saveTo(this.subject);

            assert.deepEqual(this.saved, [], 'persist defaults to false');
        });
    });

    module('updating an existing record', function (hooks) {
        hooks.beforeEach(function () {
            this.queryResult = [this.existing('cfv-1', { custom_field_uuid: 'field-1', value: 'before', value_type: 'text' })];
        });

        test('a changed value is an update, not a create', async function (assert) {
            this.manager.setField('field-1', 'after', 'text');

            const result = await this.manager.saveTo(this.subject);

            assert.strictEqual(result.created.length, 0);
            assert.strictEqual(result.updated.length, 1);
            assert.strictEqual(result.updated[0].value, 'after');
        });

        test('a changed value type alone is enough to count as an update', async function (assert) {
            this.manager.setField('field-1', 'before', 'date');

            const result = await this.manager.saveTo(this.subject);

            assert.strictEqual(result.updated.length, 1);
            assert.strictEqual(result.updated[0].value_type, 'date');
        });

        test('an unchanged value is neither created nor updated', async function (assert) {
            this.manager.setField('field-1', 'before', 'text');

            const result = await this.manager.saveTo(this.subject);

            assert.deepEqual([result.created.length, result.updated.length], [0, 0], 'nothing to write');
        });
    });

    module('deleting', function () {
        test('an existing record with nothing staged is left alone by default', async function (assert) {
            this.queryResult = [this.existing('cfv-1', { custom_field_uuid: 'field-1', value: 'x' })];

            const result = await this.manager.saveTo(this.subject);

            assert.deepEqual(result.deleted, []);
        });

        test('deleteMissing removes records for fields no longer staged', async function (assert) {
            this.queryResult = [this.existing('cfv-1', { custom_field_uuid: 'field-1', value: 'x' }), this.existing('cfv-2', { custom_field_uuid: 'field-2', value: 'y' })];
            this.manager.setField('field-1', 'x');

            const result = await this.manager.saveTo(this.subject, { deleteMissing: true });

            assert.strictEqual(result.deleted.length, 1);
            assert.strictEqual(result.deleted[0].custom_field_uuid, 'field-2', 'only the unstaged one');
        });
    });

    module('persisting', function () {
        test('created, updated and deleted records are all saved', async function (assert) {
            this.queryResult = [this.existing('cfv-1', { custom_field_uuid: 'field-1', value: 'before' }), this.existing('cfv-2', { custom_field_uuid: 'field-2', value: 'y' })];
            this.manager.setField('field-1', 'after');
            this.manager.setField('field-3', 'new');

            await this.manager.saveTo(this.subject, { persist: true, deleteMissing: true });

            assert.strictEqual(this.saved.length, 3);
        });

        test('save is called with no arguments when there are no adapter options', async function (assert) {
            this.manager.setField('field-1', 'hello');

            await this.manager.saveTo(this.subject, { persist: true });

            assert.strictEqual(this.saved[0].options, undefined);
        });

        test('adapter options are passed through when given', async function (assert) {
            this.manager.setField('field-1', 'hello');

            await this.manager.saveTo(this.subject, { persist: true, adapterOptions: { subject_uuid: 'subject-1' } });

            assert.deepEqual(this.saved[0].options, { adapterOptions: { subject_uuid: 'subject-1' } });
        });

        test('a failed save is collected rather than thrown', async function (assert) {
            this.saveRejects = true;
            this.manager.setField('field-1', 'hello');

            const result = await this.manager.saveTo(this.subject, { persist: true });

            assert.strictEqual(result.errors.length, 1);
            assert.strictEqual(result.errors[0].message, 'save failed');
            assert.strictEqual(result.created.length, 1, 'and the record is still reported');
        });
    });

    module('loading the existing records', function () {
        test('it queries scoped to the subject', async function (assert) {
            this.manager.setField('field-1', 'hello');

            await this.manager.saveTo(this.subject);

            assert.deepEqual(this.queried, [{ modelName: 'custom-field-value', params: { subject_uuid: 'subject-1' } }]);
        });

        test('a failed query is treated as no existing records', async function (assert) {
            this.queryRejects = true;
            this.manager.setField('field-1', 'hello');

            const result = await this.manager.saveTo(this.subject);

            assert.strictEqual(result.created.length, 1, 'everything staged looks new');
            assert.deepEqual(result.errors, [], 'and the query failure is not reported as an error');
        });

        test('a subject with no id skips the query entirely', async function (assert) {
            const unsaved = this.store.createRecord('widget', {});
            this.manager.setField('field-1', 'hello');

            const result = await this.manager.saveTo(unsaved);

            assert.deepEqual(this.queried, []);
            assert.strictEqual(result.created.length, 1);
        });

        test('a result that is not an array but offers toArray is unwrapped', async function (assert) {
            const record = this.existing('cfv-1', { custom_field_uuid: 'field-1', value: 'before' });
            this.queryResult = { toArray: () => [record] };
            this.manager.setField('field-1', 'after');

            const result = await this.manager.saveTo(this.subject);

            assert.strictEqual(result.updated.length, 1, 'the record was found through toArray');
        });

        test('a result that is neither is treated as empty', async function (assert) {
            this.queryResult = { nothing: true };
            this.manager.setField('field-1', 'hello');

            const result = await this.manager.saveTo(this.subject);

            assert.strictEqual(result.created.length, 1);
        });
    });

    module('validation before saving', function () {
        test('an invalid subject stops the save and reports the validation', async function (assert) {
            const manager = this.build();
            this.store.push({ data: { id: 'field-1', type: 'custom-field', attributes: { required: true, editable: true } } });
            manager.fields = [this.store.peekRecord('custom-field', 'field-1')];

            const result = await manager.saveTo(this.subject);

            assert.deepEqual([result.created, result.updated, result.deleted], [[], [], []]);
            assert.strictEqual(result.errors.length, 1);
            assert.false(result.errors[0].isValid);
        });

        test('saveOptions on the manager override the call options', async function (assert) {
            const manager = this.build({ saveOptions: { validate: false } });
            this.store.push({ data: { id: 'field-1', type: 'custom-field', attributes: { required: true, editable: true } } });
            manager.fields = [this.store.peekRecord('custom-field', 'field-1')];

            const result = await manager.saveTo(this.subject, { validate: true });

            assert.deepEqual(result.errors, [], 'the manager-level option wins, so validation is skipped');
        });
    });
});

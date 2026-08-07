import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { run } from '@ember/runloop';
import { tracked } from '@glimmer/tracking';
import Model, { attr, hasMany } from '@ember-data/model';
import SubjectCustomFields from '@fleetbase/ember-core/library/subject-custom-fields';

/**
 * SubjectCustomFields stages custom-field values for one subject and turns them
 * into `custom-field-value` records on demand.
 *
 * The store is real throughout — `query` is pointed at `peekAll` so the code
 * under test receives genuine ember-data record arrays, and only persistence
 * (`record.save`) is stubbed. Faking the arrays would hide the fact that this
 * file leans on `toArray`/`pushObject`, which ember-data only still provides
 * through its `DEPRECATE_ARRAY_LIKE` shims.
 */
class CategoryModel extends Model {
    @attr('string') name;
    @tracked customFields;
}

class CustomFieldModel extends Model {
    @attr('string') label;
    @attr('string') name;
    @attr('string') category_uuid;
    @attr('boolean') required;
    @attr('boolean') editable;
    @attr('string') value_type;
    @attr('string') default_value;

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

module('Unit | Library | subject-custom-fields', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('model:category', CategoryModel);
        this.owner.register('model:custom-field', CustomFieldModel);
        this.owner.register('model:custom-field-value', CustomFieldValueModel);
        this.owner.register('model:widget', WidgetModel);

        this.store = this.owner.lookup('service:store');

        // Persistence is the one thing stubbed: every created record reports a
        // successful save and records that it was asked to.
        this.saved = [];
        const createRecord = this.store.createRecord.bind(this.store);
        this.store.createRecord = (...args) => {
            const record = createRecord(...args);
            record.save = () => {
                this.saved.push(record);
                return Promise.resolve(record);
            };
            return record;
        };

        this.push = (type, id, attributes = {}) => this.store.push({ data: { id, type, attributes } });

        this.field = (id, attributes = {}) => this.push('custom-field', id, { required: false, editable: true, ...attributes });

        this.subject = this.push('widget', 'subject-1', { company_uuid: 'company-1' });

        this.build = (options = {}, subject = this.subject) => new SubjectCustomFields({ owner: this.store, subject, options });

        this.manager = this.build();
    });

    module('staging values', function () {
        test('a freshly built manager stages nothing', function (assert) {
            assert.deepEqual(this.manager.getProperties(), {});
            assert.deepEqual(this.manager.serialize(), []);
        });

        test('setField stages a value under the field id', function (assert) {
            this.manager.setField('field-1', 'hello', 'text');

            assert.deepEqual(this.manager.getValue('field-1'), { value: 'hello', value_type: 'text' });
        });

        test('setField accepts a field record and takes its value type', function (assert) {
            const field = this.field('field-1', { value_type: 'date' });

            this.manager.setField(field, '2026-01-01');

            assert.deepEqual(this.manager.getValue('field-1'), { value: '2026-01-01', value_type: 'date' });
        });

        test('an explicit value type wins over the field record', function (assert) {
            const field = this.field('field-1', { value_type: 'date' });

            this.manager.setField(field, 'x', 'text');

            assert.strictEqual(this.manager.getValue('field-1').value_type, 'text');
        });

        test('a string field id leaves the value type null', function (assert) {
            this.manager.setField('field-1', 'hello');

            assert.strictEqual(this.manager.getValue('field-1').value_type, null);
        });

        test('setFieldValue takes its arguments the other way round', function (assert) {
            const field = this.field('field-1', { value_type: 'text' });

            this.manager.setFieldValue('hello', field);

            assert.deepEqual(this.manager.getValue('field-1'), { value: 'hello', value_type: 'text' });
        });

        test('staging replaces the values object rather than mutating it', function (assert) {
            const before = this.manager.getProperties();

            this.manager.setField('field-1', 'hello');

            assert.deepEqual(before, {}, 'the previously handed-out copy is untouched');
        });

        test('re-staging a field overwrites it', function (assert) {
            this.manager.setField('field-1', 'first');
            this.manager.setField('field-1', 'second');

            assert.strictEqual(this.manager.getValue('field-1').value, 'second');
        });

        test('getValue on an unstaged field is undefined', function (assert) {
            assert.strictEqual(this.manager.getValue('nope'), undefined);
        });

        test('clear drops every staged value', function (assert) {
            this.manager.setField('field-1', 'hello');

            this.manager.clear();

            assert.deepEqual(this.manager.getProperties(), {});
        });

        test('serialize emits one entry per staged field', function (assert) {
            this.manager.setField('field-1', 'a', 'text');
            this.manager.setField('field-2', 'b', 'date');

            assert.deepEqual(this.manager.serialize(), [
                { custom_field_uuid: 'field-1', value: 'a', value_type: 'text' },
                { custom_field_uuid: 'field-2', value: 'b', value_type: 'date' },
            ]);
        });
    });

    module('setProperties', function () {
        test('it stages several entries at once', function (assert) {
            this.manager.setProperties([
                { fieldId: 'field-1', value: 'a', value_type: 'text' },
                { fieldId: 'field-2', value: 'b', value_type: 'date' },
            ]);

            assert.deepEqual(this.manager.getProperties(), {
                'field-1': { value: 'a', value_type: 'text' },
                'field-2': { value: 'b', value_type: 'date' },
            });
        });

        test('a missing value type is looked up from the store', function (assert) {
            this.field('field-1', { value_type: 'date' });

            this.manager.setProperties([{ fieldId: 'field-1', value: 'a' }]);

            assert.strictEqual(this.manager.getValue('field-1').value_type, 'date');
        });

        test('an unknown field leaves the value type null', function (assert) {
            this.manager.setProperties([{ fieldId: 'ghost', value: 'a' }]);

            assert.strictEqual(this.manager.getValue('ghost').value_type, null);
        });

        test('it merges into whatever is already staged', function (assert) {
            this.manager.setField('field-1', 'kept', 'text');

            this.manager.setProperties([{ fieldId: 'field-2', value: 'added', value_type: 'text' }]);

            assert.deepEqual(Object.keys(this.manager.getProperties()), ['field-1', 'field-2']);
        });

        test('with no argument it stages nothing', function (assert) {
            this.manager.setProperties();

            assert.deepEqual(this.manager.getProperties(), {});
        });
    });

    module('required fields', function () {
        test('only required and editable fields count', function (assert) {
            this.manager.fields = [
                this.field('a', { required: true, editable: true }),
                this.field('b', { required: true, editable: false }),
                this.field('c', { required: false, editable: true }),
            ];

            assert.deepEqual(
                this.manager.requiredFields.map((cf) => cf.id),
                ['a']
            );
        });

        test('with nothing loaded there are no required fields', function (assert) {
            assert.deepEqual(this.manager.requiredFields, []);
        });

        test('a field with no explicit editable flag still counts', function (assert) {
            this.manager.fields = [this.push('custom-field', 'a', { required: true })];

            assert.strictEqual(this.manager.requiredFields.length, 1, 'only an explicit false excludes a field');
        });
    });

    module('validateRequired', function (hooks) {
        hooks.beforeEach(function () {
            this.groups = [this.push('category', 'group-1', { name: 'Details' })];
            this.manager.groups = this.groups;
        });

        test('with no required fields it is valid', function (assert) {
            const result = this.manager.validateRequired();

            assert.true(result.isValid);
            assert.deepEqual(result.missing, []);
            assert.strictEqual(result.errors.size, 0);
        });

        test('a staged value satisfies a required field', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text' })];
            this.manager.setField('a', 'present');

            assert.true(this.manager.validateRequired().isValid);
        });

        test('a missing value is reported with its field and group', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', category_uuid: 'group-1', label: 'Colour' })];

            const result = this.manager.validateRequired();

            assert.false(result.isValid);
            assert.strictEqual(result.missing.length, 1);
            assert.strictEqual(result.missing[0].fieldId, 'a');
            assert.strictEqual(result.missing[0].group, this.groups[0], 'the group is resolved from the loaded groups');
            assert.strictEqual(result.errors.get('a'), 'Colour is required.');
        });

        test('the error text falls back to the field name, then to a generic phrase', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', name: 'colour' }), this.field('b', { required: true, value_type: 'text' })];

            const { errors } = this.manager.validateRequired();

            assert.strictEqual(errors.get('a'), 'colour is required.');
            assert.strictEqual(errors.get('b'), 'This field is required.');
        });

        test('a custom message hook replaces the text', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', label: 'Colour' })];

            const { errors } = this.manager.validateRequired({ customMessage: (cf) => `Please supply ${cf.label}` });

            assert.strictEqual(errors.get('a'), 'Please supply Colour');
        });

        test('a custom message returning nothing falls back to the default', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', label: 'Colour' })];

            const { errors } = this.manager.validateRequired({ customMessage: () => null });

            assert.strictEqual(errors.get('a'), 'Colour is required.');
        });

        test('misses are grouped by category, ungrouped ones under null', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', category_uuid: 'group-1' }), this.field('b', { required: true, value_type: 'text' })];

            const { byGroup } = this.manager.validateRequired();

            assert.deepEqual(
                byGroup.get('group-1').map((m) => m.fieldId),
                ['a']
            );
            assert.deepEqual(
                byGroup.get(null).map((m) => m.fieldId),
                ['b']
            );
        });

        test('includeUngrouped false skips fields with no category', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', category_uuid: 'group-1' }), this.field('b', { required: true, value_type: 'text' })];

            const { missing } = this.manager.validateRequired({ includeUngrouped: false });

            assert.deepEqual(
                missing.map((m) => m.fieldId),
                ['a']
            );
        });

        test('a field pointing at an unknown group is still reported, with a null group', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', category_uuid: 'ghost' })];

            const { missing } = this.manager.validateRequired();

            assert.strictEqual(missing[0].group, null);
        });

        test('stopEarly returns on the first miss', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text' }), this.field('b', { required: true, value_type: 'text' })];

            const { missing } = this.manager.validateRequired({ stopEarly: true });

            assert.strictEqual(missing.length, 1, 'the second miss is never examined');
        });

        test('instance validationOptions override the per-call ones', function (assert) {
            const manager = this.build({ validationOptions: { stopEarly: true } });
            manager.fields = [this.field('a', { required: true, value_type: 'text' }), this.field('b', { required: true, value_type: 'text' })];

            assert.strictEqual(manager.validateRequired({ stopEarly: false }).missing.length, 1);
        });
    });

    module('presence by value type', function () {
        function requires(assert, manager, valueType, value, expected, label) {
            manager.fields = [manager.store.peekRecord('custom-field', 'a')];
            manager.clear();
            if (value !== undefined) {
                manager.setField('a', value);
            }
            assert.strictEqual(manager.validateRequired().isValid, expected, label);
        }

        test('text treats whitespace as absent', function (assert) {
            this.field('a', { required: true, value_type: 'text' });

            requires(assert, this.manager, 'text', 'hello', true, 'a word is present');
            requires(assert, this.manager, 'text', '   ', false, 'whitespace is not');
            requires(assert, this.manager, 'text', '', false, 'the empty string is not');
            requires(assert, this.manager, 'text', 42, false, 'a non-string is not');
        });

        test('model behaves like text', function (assert) {
            this.field('a', { required: true, value_type: 'model' });

            requires(assert, this.manager, 'model', 'uuid-1', true, 'an id is present');
            requires(assert, this.manager, 'model', '  ', false, 'whitespace is not');
        });

        test('date requires something parseable', function (assert) {
            this.field('a', { required: true, value_type: 'date' });

            requires(assert, this.manager, 'date', '2026-01-01', true, 'an ISO date is present');
            requires(assert, this.manager, 'date', 'not a date', false, 'an unparseable string is not');
            requires(assert, this.manager, 'date', '', false, 'the empty string is not');
            requires(assert, this.manager, 'date', null, false, 'null is not');
        });

        test('file requires something that looks like JSON', function (assert) {
            this.field('a', { required: true, value_type: 'file' });

            requires(assert, this.manager, 'file', '{"url":"x"}', true, 'a JSON object is present');
            requires(assert, this.manager, 'file', 'plain', false, 'a bare string is not');
        });

        test('an unrecognised type accepts any non-empty value', function (assert) {
            this.field('a', { required: true, value_type: 'boolean' });

            requires(assert, this.manager, 'boolean', false, true, 'false is a value');
            requires(assert, this.manager, 'boolean', 0, true, 'zero is a value');
            requires(assert, this.manager, 'boolean', '', false, 'the empty string is not');
            requires(assert, this.manager, 'boolean', null, false, 'null is not');
        });

        test('a default value satisfies a required field when nothing is staged', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', default_value: 'fallback' })];

            assert.true(this.manager.validateRequired().isValid);
        });

        test('an explicitly staged empty value beats the default', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', default_value: 'fallback' })];
            this.manager.setField('a', '');

            assert.false(this.manager.validateRequired().isValid, 'staging empty is a deliberate act, not a fallthrough');
        });

        test('an empty default is treated as no default', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', default_value: '' })];

            assert.false(this.manager.validateRequired().isValid);
        });
    });

    module('validation summaries', function () {
        test('isValidRequired reflects validateRequired', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text' })];

            assert.false(this.manager.isValidRequired);

            this.manager.setField('a', 'present');
            assert.true(this.manager.isValidRequired);
        });

        test('missingRequiredFieldIds lists just the ids', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text' }), this.field('b', { required: true, value_type: 'text' })];

            assert.deepEqual(this.manager.missingRequiredFieldIds, ['a', 'b']);
        });

        test('missingByGroupName keys the misses by group name', function (assert) {
            this.manager.groups = [this.push('category', 'group-1', { name: 'Details' })];
            this.manager.fields = [this.field('a', { required: true, value_type: 'text', category_uuid: 'group-1' })];

            const byName = this.manager.missingByGroupName;

            assert.deepEqual([...byName.keys()], ['Details']);
            assert.strictEqual(byName.get('Details')[0].fieldId, 'a');
        });

        test('misses with no group are collected under Ungrouped', function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text' })];

            assert.deepEqual([...this.manager.missingByGroupName.keys()], ['Ungrouped']);
        });
    });

    module('grouping', function () {
        test('getFields and getGroups return empty arrays before a load', function (assert) {
            assert.deepEqual(this.manager.getFields(), []);
            assert.deepEqual(this.manager.getGroups(), []);
        });

        test('getGroupedFields attaches each field to its group', async function (assert) {
            const group = this.push('category', 'group-1', { name: 'Details' });
            this.manager.groups = [group];
            this.manager.fields = [this.field('a', { category_uuid: 'group-1' }), this.field('b', { category_uuid: 'group-1' })];

            const groups = run(() => this.manager.getGroupedFields());

            assert.deepEqual(
                groups[0].customFields.map((cf) => cf.id),
                ['a', 'b'],
                'the attachment is scheduled for afterRender'
            );
        });

        test('a group with no fields is given an empty list', async function (assert) {
            const group = this.push('category', 'group-1', { name: 'Empty' });
            this.manager.groups = [group];
            this.manager.fields = [this.field('a')];

            this.manager.getGroupedFields();
            run(() => {});

            assert.deepEqual(group.customFields, [], 'ungrouped fields are not attached to an arbitrary group');
        });

        test('re-grouping the same fields leaves the array in place', async function (assert) {
            const group = this.push('category', 'group-1', { name: 'Details' });
            this.manager.groups = [group];
            this.manager.fields = [this.field('a', { category_uuid: 'group-1' })];

            this.manager.getGroupedFields();
            run(() => {});
            const first = group.customFields;

            this.manager.getGroupedFields();
            run(() => {});

            assert.strictEqual(group.customFields, first, 'an unchanged group is not rewritten');
        });

        test('a changed field set replaces the group list', async function (assert) {
            const group = this.push('category', 'group-1', { name: 'Details' });
            this.manager.groups = [group];
            this.manager.fields = [this.field('a', { category_uuid: 'group-1' })];

            this.manager.getGroupedFields();
            run(() => {});

            this.manager.fields = [this.field('a', { category_uuid: 'group-1' }), this.field('b', { category_uuid: 'group-1' })];
            this.manager.getGroupedFields();
            run(() => {});

            assert.deepEqual(
                group.customFields.map((cf) => cf.id),
                ['a', 'b']
            );
        });

        test('customFieldGroups is getGroupedFields', function (assert) {
            this.manager.groups = [this.push('category', 'group-1', { name: 'Details' })];

            assert.deepEqual(
                this.manager.customFieldGroups.map((g) => g.id),
                ['group-1']
            );
        });

        test('getGroupedEntries pairs each group with its fields', async function (assert) {
            const group = this.push('category', 'group-1', { name: 'Details' });
            this.manager.groups = [group];
            this.manager.fields = [this.field('a', { category_uuid: 'group-1' })];

            this.manager.getGroupedFields();
            run(() => {});
            const entries = this.manager.getGroupedEntries();

            assert.strictEqual(entries[0].group, group);
            assert.deepEqual(
                entries[0].customFields.map((cf) => cf.id),
                ['a']
            );
        });

        test('getGroupedEntries copes with a group that was never grouped', function (assert) {
            this.manager.groups = [this.push('category', 'group-1', { name: 'Details' })];

            assert.deepEqual(this.manager.getGroupedEntries()[0].customFields, []);
        });
    });

    module('load', function (hooks) {
        hooks.beforeEach(function () {
            this.queries = [];
            this.store.query = (modelName, params) => {
                this.queries.push({ modelName, params });
                return Promise.resolve(this.store.peekAll(modelName));
            };
        });

        test('it queries groups for the subject and fields by subject id', async function (assert) {
            await this.manager.load();

            assert.deepEqual(this.queries[0], { modelName: 'category', params: { owner_uuid: 'subject-1', for: 'custom_field_group' } });
            assert.deepEqual(this.queries[1], { modelName: 'custom-field', params: { subject_uuid: 'subject-1', limit: -1 } });
        });

        test('fieldFor switches the field query to a schema-wide one', async function (assert) {
            await this.manager.load({ fieldFor: 'subject:widget' });

            assert.deepEqual(this.queries[1].params, { for: 'subject:widget', limit: -1 });
        });

        test('groupedFor is passed through', async function (assert) {
            await this.manager.load({ groupedFor: 'other_group' });

            assert.strictEqual(this.queries[0].params.for, 'other_group');
        });

        test('instance loadOptions override the per-call ones', async function (assert) {
            const manager = this.build({ loadOptions: { groupedFor: 'instance_group' } });

            await manager.load({ groupedFor: 'call_group' });

            assert.strictEqual(this.queries[0].params.for, 'instance_group');
        });

        test('it retains the results for getFields and getGroups', async function (assert) {
            this.push('category', 'group-1', { name: 'Details' });
            this.field('a');

            await this.manager.load();

            assert.deepEqual(
                this.manager.getGroups().map((g) => g.id),
                ['group-1']
            );
            assert.deepEqual(
                this.manager.getFields().map((f) => f.id),
                ['a']
            );
        });

        test('it resolves to the raw results by default', async function (assert) {
            const result = await this.manager.load();

            assert.ok(result.groups, 'groups are returned');
            assert.ok(result.fields, 'fields are returned');
        });

        test('group true resolves to the grouped structure instead', async function (assert) {
            this.push('category', 'group-1', { name: 'Details' });
            this.field('a', { category_uuid: 'group-1' });

            const result = await this.manager.load({ group: true });
            run(() => {});

            assert.deepEqual(
                result.map((g) => g.id),
                ['group-1']
            );
            assert.deepEqual(
                result[0].customFields.map((cf) => cf.id),
                ['a']
            );
        });
    });

    module('writeFieldValue', function () {
        test('it stages the value and creates a record on the resource', function (assert) {
            const field = this.field('field-1', { value_type: 'text' });

            this.manager.writeFieldValue(this.subject, 'hello', field);

            assert.deepEqual(this.manager.getValue('field-1'), { value: 'hello', value_type: 'text' }, 'the value is staged');
            const values = this.subject.custom_field_values;
            assert.strictEqual(values.length, 1);
            assert.strictEqual(values[0].value, 'hello');
            assert.strictEqual(values[0].custom_field_uuid, 'field-1');
            assert.strictEqual(values[0].subject_uuid, 'subject-1', 'the record is tied to the subject');
            assert.strictEqual(values[0].company_uuid, 'company-1', 'the company is carried across');
        });

        test('writing again updates the existing record rather than adding one', function (assert) {
            const field = this.field('field-1', { value_type: 'text' });

            this.manager.writeFieldValue(this.subject, 'first', field);
            this.manager.writeFieldValue(this.subject, 'second', field);

            assert.strictEqual(this.subject.custom_field_values.length, 1, 'the relationship holds one record');
            assert.strictEqual(this.subject.custom_field_values[0].value, 'second');
        });

        test('an unchanged write leaves the record alone', function (assert) {
            const field = this.field('field-1', { value_type: 'text' });
            this.manager.writeFieldValue(this.subject, 'same', field);
            const record = this.subject.custom_field_values[0];

            this.manager.writeFieldValue(this.subject, 'same', field);

            assert.strictEqual(this.subject.custom_field_values[0], record);
            assert.strictEqual(record.value, 'same');
        });

        test('a null value is stored as an empty string', function (assert) {
            const field = this.field('field-1', { value_type: 'text' });

            this.manager.writeFieldValue(this.subject, null, field);

            assert.strictEqual(this.subject.custom_field_values[0].value, '');
        });

        test('a string field id writes a record with no value type', function (assert) {
            this.manager.writeFieldValue(this.subject, 'hello', 'field-1');

            assert.strictEqual(this.subject.custom_field_values[0].value_type, null);
        });

        test('it takes value_type when the field uses the snake-case name', function (assert) {
            this.manager.writeFieldValue(this.subject, 'hello', { id: 'field-1', value_type: 'date' });

            assert.strictEqual(this.subject.custom_field_values[0].value_type, 'date');
        });

        test('without a resource it only stages the value', function (assert) {
            this.manager.writeFieldValue(null, 'hello', { id: 'field-1' });

            assert.strictEqual(this.manager.getValue('field-1').value, 'hello');
            assert.strictEqual(this.subject.custom_field_values.length, 0);
        });

        test('without a field id it writes nothing to the resource', function (assert) {
            this.manager.writeFieldValue(this.subject, 'hello', { id: null });

            assert.strictEqual(this.subject.custom_field_values.length, 0);
        });
    });

    module('saveTo', function () {
        test('it refuses to save while a required field is missing', async function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text' })];

            const result = await this.manager.saveTo(this.subject);

            assert.deepEqual(result.created, []);
            assert.strictEqual(result.errors.length, 1);
            assert.false(result.errors[0].isValid, 'the validation result is handed back as the error');
        });

        test('validate false saves regardless', async function (assert) {
            this.manager.fields = [this.field('a', { required: true, value_type: 'text' })];
            this.manager.setField('b', 'value');

            const result = await this.manager.saveTo(this.subject, { validate: false });

            assert.strictEqual(result.created.length, 1);
            assert.deepEqual(result.errors, []);
        });

        test('a staged value with no existing record is created', async function (assert) {
            this.manager.setField('field-1', 'hello', 'text');

            const { created, updated, deleted } = await this.manager.saveTo(this.subject);

            assert.strictEqual(created.length, 1);
            assert.strictEqual(created[0].custom_field_uuid, 'field-1');
            assert.strictEqual(created[0].value, 'hello');
            assert.strictEqual(created[0].value_type, 'text');
            assert.deepEqual(updated, []);
            assert.deepEqual(deleted, []);
        });

        test('a changed value on an existing record is an update', async function (assert) {
            const existing = this.push('custom-field-value', 'value-1', { custom_field_uuid: 'field-1', value: 'old', value_type: 'text' });
            this.subject.custom_field_values = [existing];
            this.manager.setField('field-1', 'new', 'text');

            const { created, updated } = await this.manager.saveTo(this.subject);

            assert.deepEqual(created, []);
            assert.strictEqual(updated.length, 1);
            assert.strictEqual(updated[0].value, 'new');
        });

        test('an unchanged value is neither created nor updated', async function (assert) {
            const existing = this.push('custom-field-value', 'value-1', { custom_field_uuid: 'field-1', value: 'same', value_type: 'text' });
            this.subject.custom_field_values = [existing];
            this.manager.setField('field-1', 'same', 'text');

            const { created, updated } = await this.manager.saveTo(this.subject);

            assert.deepEqual(created, []);
            assert.deepEqual(updated, []);
        });

        test('a changed value type alone counts as an update', async function (assert) {
            const existing = this.push('custom-field-value', 'value-1', { custom_field_uuid: 'field-1', value: 'same', value_type: 'text' });
            this.subject.custom_field_values = [existing];
            this.manager.setField('field-1', 'same', 'date');

            const { updated } = await this.manager.saveTo(this.subject);

            assert.strictEqual(updated.length, 1);
            assert.strictEqual(updated[0].value_type, 'date');
        });

        test('deleteMissing removes records for fields no longer staged', async function (assert) {
            const stale = this.push('custom-field-value', 'value-1', { custom_field_uuid: 'gone', value: 'x' });
            this.subject.custom_field_values = [stale];
            this.manager.setField('field-1', 'kept', 'text');

            const { deleted } = await this.manager.saveTo(this.subject, { deleteMissing: true });

            assert.strictEqual(deleted.length, 1);
            assert.strictEqual(deleted[0], stale);
            assert.true(stale.isDeleted);
        });

        test('without deleteMissing stale records survive', async function (assert) {
            const stale = this.push('custom-field-value', 'value-1', { custom_field_uuid: 'gone', value: 'x' });
            this.subject.custom_field_values = [stale];

            const { deleted } = await this.manager.saveTo(this.subject);

            assert.deepEqual(deleted, []);
            assert.false(stale.isDeleted);
        });

        test('persist false returns the records without saving them', async function (assert) {
            this.manager.setField('field-1', 'hello', 'text');

            await this.manager.saveTo(this.subject);

            assert.deepEqual(this.saved, [], 'nothing was persisted');
        });

        test('persist true saves the created records', async function (assert) {
            this.manager.setField('field-1', 'hello', 'text');

            const { created } = await this.manager.saveTo(this.subject, { persist: true });

            assert.deepEqual(this.saved, created);
        });

        test('a failed save is collected rather than thrown', async function (assert) {
            this.manager.setField('field-1', 'hello', 'text');
            const boom = new Error('nope');
            const createRecord = this.store.createRecord.bind(this.store);
            this.store.createRecord = (...args) => {
                const record = createRecord(...args);
                record.save = () => Promise.reject(boom);
                return record;
            };

            const { errors } = await this.manager.saveTo(this.subject, { persist: true });

            assert.deepEqual(errors, [boom]);
        });

        test('reloadExisting fetches the current values from the store', async function (assert) {
            this.push('custom-field-value', 'value-1', { custom_field_uuid: 'field-1', value: 'old', value_type: 'text' });
            this.manager.setField('field-1', 'new', 'text');
            let queried = false;
            this.store.query = (modelName, params) => {
                queried = { modelName, params };
                return Promise.resolve(this.store.peekAll('custom-field-value'));
            };

            const { updated } = await this.manager.saveTo(this.subject, { reloadExisting: true });

            assert.deepEqual(queried, { modelName: 'custom-field-value', params: { subject_uuid: 'subject-1' } });
            assert.strictEqual(updated.length, 1, 'the fetched record is updated rather than duplicated');
        });

        test('a failed reload falls back to an empty set', async function (assert) {
            this.manager.setField('field-1', 'hello', 'text');
            this.store.query = () => Promise.reject(new Error('offline'));

            const { created, errors } = await this.manager.saveTo(this.subject, { reloadExisting: true });

            assert.strictEqual(created.length, 1, 'staged values are still created');
            assert.deepEqual(errors, []);
        });

        test('instance saveOptions override the per-call ones', async function (assert) {
            const manager = this.build({ saveOptions: { persist: false } });
            manager.setField('field-1', 'hello', 'text');

            await manager.saveTo(this.subject, { persist: true });

            assert.deepEqual(this.saved, [], 'the instance option wins');
        });

        test('with nothing staged it returns four empty lists', async function (assert) {
            const result = await this.manager.saveTo(this.subject);

            assert.deepEqual(result, { created: [], updated: [], deleted: [], errors: [] });
        });
    });
});

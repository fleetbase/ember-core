import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { tracked } from '@glimmer/tracking';
import Model, { attr, hasMany } from '@ember-data/model';
import SubjectCustomFields from '@fleetbase/ember-core/library/subject-custom-fields';

/**
 * The guards and fallbacks the two sibling files do not reach: writeFieldValue
 * against a resource whose relationship is not loaded, the required-field
 * filter, and the `?? []` fallbacks on the tracked collections.
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
    @attr('string') company_uuid;
    @attr('string') value;
    @attr('string') value_type;
}

class WidgetModel extends Model {
    @attr('string') company_uuid;
    @hasMany('custom-field-value', { async: false, inverse: null }) custom_field_values;
}

module('Unit | Library | subject-custom-fields (edges)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('model:category', CategoryModel);
        this.owner.register('model:custom-field', CustomFieldModel);
        this.owner.register('model:custom-field-value', CustomFieldValueModel);
        this.owner.register('model:widget', WidgetModel);

        this.store = this.owner.lookup('service:store');
        this.push = (type, id, attributes = {}) => this.store.push({ data: { id, type, attributes } });
        this.field = (id, attributes = {}) => this.push('custom-field', id, { required: false, editable: true, ...attributes });

        this.subject = this.push('widget', 'subject-1', { company_uuid: 'company-1' });
        this.manager = new SubjectCustomFields({ owner: this.store, subject: this.subject, options: {} });
    });

    module('requiredFields', function () {
        test('only fields marked required are included', function (assert) {
            this.manager.fields = [this.field('a', { required: true }), this.field('b', { required: false })];

            assert.deepEqual(
                this.manager.requiredFields.map((f) => f.id),
                ['a']
            );
        });

        test('a required field that is not editable is excluded', function (assert) {
            this.manager.fields = [this.field('a', { required: true, editable: false }), this.field('b', { required: true, editable: true })];

            assert.deepEqual(
                this.manager.requiredFields.map((f) => f.id),
                ['b'],
                'you cannot be asked to fill in what you cannot edit'
            );
        });

        test('a required field with no editable flag at all counts', function (assert) {
            this.manager.fields = [this.push('custom-field', 'a', { required: true })];

            assert.strictEqual(this.manager.requiredFields.length, 1, 'only an explicit false excludes it');
        });

        test('a truthy but non-true required flag does not count', function (assert) {
            this.manager.fields = [{ id: 'a', required: 1, editable: true }];

            assert.deepEqual(this.manager.requiredFields, [], 'the check is === true');
        });
    });

    module('the tracked collections when they are emptied', function () {
        test('getFields falls back to an empty list', function (assert) {
            this.manager.fields = null;

            assert.deepEqual(this.manager.getFields(), []);
        });

        test('getGroups falls back to an empty list', function (assert) {
            this.manager.groups = null;

            assert.deepEqual(this.manager.getGroups(), []);
        });

        test('requiredFields copes with no fields at all', function (assert) {
            this.manager.fields = null;

            assert.deepEqual(this.manager.requiredFields, []);
        });

        test('validateRequired copes with no groups', function (assert) {
            this.manager.groups = null;
            this.manager.fields = [this.field('a', { required: true })];

            const result = this.manager.validateRequired();

            assert.false(result.isValid);
            assert.strictEqual(result.missing[0].group, null, 'the missing entry simply has no group');
        });
    });

    module('setProperties without a value type', function () {
        test('it takes the type from the stored field record', function (assert) {
            this.field('field-1', { value_type: 'date' });

            this.manager.setProperties([{ fieldId: 'field-1', value: '2026-01-01' }]);

            assert.strictEqual(this.manager.getValue('field-1').value_type, 'date');
        });

        test('a field the store does not know leaves the type null', function (assert) {
            this.manager.setProperties([{ fieldId: 'unknown-field', value: 'x' }]);

            assert.strictEqual(this.manager.getValue('unknown-field').value_type, null);
        });

        test('an explicit type is used as given', function (assert) {
            this.field('field-1', { value_type: 'date' });

            this.manager.setProperties([{ fieldId: 'field-1', value: 'x', value_type: 'text' }]);

            assert.strictEqual(this.manager.getValue('field-1').value_type, 'text');
        });

        test('no entries at all is a no-op', function (assert) {
            this.manager.setProperties();

            assert.deepEqual(this.manager.getProperties(), {});
        });
    });

    module('writeFieldValue against a resource with no loaded relationship', function () {
        test('it stages the value but writes no record', function (assert) {
            // `#getLocalValueRecord` and `#addToHasManyOnce` both open with
            // `if (!many) return`, which a real model never triggers — its
            // hasMany is always a ManyArray. A resource that reports nothing is
            // what reaches those guards.
            const resource = { company_uuid: 'company-1', get: () => null };

            this.manager.writeFieldValue(resource, 'hello', 'field-1');

            assert.deepEqual(this.manager.getValue('field-1'), { value: 'hello', value_type: null }, 'staging still happened');
        });

        test('an existing record is updated in place when the relationship is loaded', function (assert) {
            const record = this.push('custom-field-value', 'cfv-1', { custom_field_uuid: 'field-1', value: 'before', value_type: 'text' });
            this.subject.custom_field_values.push(record);

            this.manager.writeFieldValue(this.subject, 'after', this.field('field-1', { value_type: 'text' }));

            assert.strictEqual(record.value, 'after');
            assert.strictEqual(record.value_type, 'text', 'unchanged, so it was not rewritten');
        });

        test('a changed value type is written onto the existing record', function (assert) {
            const record = this.push('custom-field-value', 'cfv-1', { custom_field_uuid: 'field-1', value: 'x', value_type: 'text' });
            this.subject.custom_field_values.push(record);

            this.manager.writeFieldValue(this.subject, 'x', this.field('field-1', { value_type: 'date' }));

            assert.strictEqual(record.value_type, 'date');
        });

        test('no field id means nothing happens', function (assert) {
            const resource = { get: () => null };

            this.manager.writeFieldValue(resource, 'hello', null);

            assert.deepEqual(this.manager.getProperties(), {}, 'not even staged');
        });

        test('no resource means nothing is written', function (assert) {
            this.manager.writeFieldValue(null, 'hello', 'field-1');

            assert.deepEqual(this.manager.getValue('field-1'), { value: 'hello', value_type: null }, 'but it is still staged');
        });
    });
});

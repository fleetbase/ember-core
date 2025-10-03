import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { setOwner, getOwner } from '@ember/application';
import { action } from '@ember/object';
import { isArray } from '@ember/array';
import { sameIds } from '../utils/array-utils';
import { scheduleOnce } from '@ember/runloop';

export default class SubjectCustomFields {
    @service store;
    @tracked subject;
    @tracked groups = [];
    @tracked fields = [];
    @tracked values = Object.create(null);
    @tracked options = {};

    constructor({ owner, subject, options = {} }) {
        setOwner(this, getOwner(owner));
        this.subject = subject;
        this.options = options;
    }

    get customFieldGroups() {
        return this.getGroupedFields();
    }

    get requiredFields() {
        return (this.fields ?? []).filter((cf) => cf.required === true && cf.editable !== false);
    }

    get isValidRequired() {
        return this.validateRequired({ stopEarly: true }).isValid;
    }

    get missingRequiredFieldIds() {
        return this.validateRequired().missing.map((m) => m.fieldId);
    }

    get missingByGroupName() {
        const res = this.validateRequired();
        const out = new Map();
        for (const [groupId, items] of res.byGroup.entries()) {
            const name = this.groups?.find((g) => g.id === groupId)?.name ?? 'Ungrouped';
            out.set(name, items);
        }
        return out;
    }

    // ---------- Value API (mirrors Ember "set/get" ergonomics) ----------
    @action setFieldValue(value, customField) {
        this.setField(customField, value);
    }

    @action setField(customFieldOrId, value, valueType) {
        const fieldId = typeof customFieldOrId === 'string' ? customFieldOrId : customFieldOrId.id;
        const vt = valueType ?? this.#normalizeValueType(customFieldOrId);
        this.values = {
            ...this.values,
            [fieldId]: { value, value_type: vt ?? null },
        };
    }

    @action writeFieldValue(resource, value, customField) {
        this.setFieldValue(value, customField);

        const fieldId = typeof customField === 'string' ? customField : customField?.id;
        const valueType = typeof customField === 'string' ? null : customField?.valueType ?? customField?.value_type ?? null;
        if (!fieldId || !resource) return;

        let rec = this.#getLocalValueRecord(resource, fieldId);
        const nextVal = value ?? '';
        const nextType = valueType ?? null;

        if (!rec) {
            rec = this.#createLocalValueRecord(fieldId, nextVal, nextType, resource);

            this.#addToHasManyOnce(resource, rec);
            return;
        }

        if (rec.value !== nextVal) rec.value = nextVal;
        if (rec.value_type !== nextType) rec.value_type = nextType;

        this.#addToHasManyOnce(resource, rec);
    }

    @action setProperties(entries = []) {
        const next = { ...this.values };
        for (const entry of entries) {
            const { fieldId, value } = entry;
            let { value_type } = entry;
            if (!value_type) {
                const cf = this.store.peekRecord?.('custom-field', fieldId);
                value_type = cf ? cf.valueType ?? cf.value_type ?? null : null;
            }
            next[fieldId] = { value, value_type };
        }
        this.values = next;
    }

    @action getValue(customFieldId) {
        return this.values?.[customFieldId];
    }

    @action getProperties() {
        return { ...this.values };
    }

    @action clear() {
        this.values = Object.create(null);
    }

    serialize() {
        return Object.entries(this.values).map(([custom_field_uuid, { value, value_type }]) => ({
            custom_field_uuid,
            value,
            value_type,
        }));
    }

    // ---------- Definition loading & accessors ----------
    /**
     * Load groups & fields for this.subject
     * @param {{ group?: boolean }} options
     * @returns {Promise<{groups: any[], fields: any[]} | any[]>}
     */
    async load(options = {}) {
        const { group = false, groupedFor = 'custom_field_group', fieldFor = null } = { ...options, ...(this.options?.loadOptions ?? {}) };
        const subjectId = this.subject.id;

        const groups = await this.store.query('category', {
            owner_uuid: subjectId,
            for: groupedFor,
        });

        // If `fieldFor` is provided then we are fetching custom fields for resource and not an instance of something
        // this means custom fields can be tied to individual resource instances OR tied to the schema of a resource kind
        const fieldsQp = fieldFor ? { for: fieldFor } : { subject_uuid: subjectId };
        const fields = await this.store.query('custom-field', fieldsQp);

        // retain on instance for getGroups/getFields()
        this.groups = groups.toArray();
        this.fields = fields.toArray();

        if (group) {
            return this.getGroupedFields();
        }
        return { groups, fields };
    }

    /** Raw fields array (last loaded) */
    getFields() {
        return this.fields ?? [];
    }

    /** Raw groups array (last loaded) */
    getGroups() {
        return this.groups ?? [];
    }

    /**
     * Validate that all required fields have effective values (staged or default).
     * @param {Object} options
     * @param {boolean} [options.includeUngrouped=true] consider fields without a category
     * @param {boolean} [options.stopEarly=false] return on first miss
     * @param {(cf: any, value: string|null) => string | null} [options.customMessage] custom error text hook
     * @returns {{
     *   isValid: boolean,
     *   missing: Array<{ field: any, fieldId: string, group: any|null }>,
     *   errors: Map<string,string>,
     *   byGroup: Map<string|null, Array<{ field: any, fieldId: string }>>
     * }}
     */
    validateRequired(options = {}) {
        const { includeUngrouped = true, stopEarly = false, customMessage } = { ...options, ...(this.options?.validationOptions ?? {}) };

        const groupsById = new Map((this.groups ?? []).map((g) => [g.id, g]));
        const missing = [];
        const errors = new Map();
        const byGroup = new Map();

        for (const cf of this.requiredFields) {
            const fieldId = cf.id;
            const groupId = cf.category_uuid ?? null;
            const group = groupsById.get(groupId) ?? null;

            if (!includeUngrouped && !group) continue;

            const valueType = cf.valueType; // from your computed
            const value = this.#resolvedValue(cf);

            if (!this.#isPresentForType(value, valueType)) {
                missing.push({ field: cf, fieldId, group });

                const msg = customMessage?.(cf, value) ?? `${cf.label ?? cf.name ?? 'This field'} is required.`;

                errors.set(fieldId, msg);

                const list = byGroup.get(groupId) ?? [];
                list.push({ field: cf, fieldId });
                byGroup.set(groupId, list);

                if (stopEarly) {
                    return { isValid: false, missing, errors, byGroup };
                }
            }
        }

        return {
            isValid: missing.length === 0,
            missing,
            errors,
            byGroup,
        };
    }

    /**
     * Persist staged values as `custom-field-value` records for this.subject.
     *
     * @param {Model} subject
     * @param {Object} options
     * @param {boolean} [options.validate=true]      Run required-field validation first
     * @param {boolean} [options.deleteMissing=false]Delete existing records for fields not present in staged values
     * @param {boolean} [options.persist=false]       Actually call .save(); if false, just returns unsaved records
     * @param {boolean} [options.reloadExisting=false] Query store for existing values if relationship isn't loaded
     * @param {Object}  [options.adapterOptions]     Optional adapterOptions passed to .save({ adapterOptions })
     * @returns {Promise<{created: Model[], updated: Model[], deleted: Model[], errors: any[]}>}
     */
    async saveTo(subject, options = {}) {
        const { validate = true, deleteMissing = false, persist = false, reloadExisting = false, adapterOptions } = { ...options, ...(this.options?.saveOptions ?? {}) };

        // Validate requireds
        if (validate) {
            const vr = this.validateRequired({ stopEarly: true });
            if (!vr.isValid) {
                return { created: [], updated: [], deleted: [], errors: [vr] };
            }
        }

        // Build a map of existing records by custom_field_uuid
        const subjectId = subject.id;
        let existingMany = subject.hasMany?.('custom_field_values')?.value?.() ?? null;

        // If asked or not loaded, fetch from API (scoped to subject)
        if (reloadExisting || !existingMany) {
            try {
                existingMany = await this.store.query('custom-field-value', {
                    subject_uuid: subjectId,
                });
            } catch (e) {
                existingMany = existingMany ?? [];
            }
        }

        // Normalize to array
        const existing = isArray(existingMany) ? existingMany : existingMany?.toArray?.() ?? [];

        const byFieldId = new Map();
        for (let i = 0; i < existing.length; i++) {
            const rec = existing[i];
            byFieldId.set(rec.custom_field_uuid, rec);
        }

        const stagedEntries = Object.entries(this.values ?? {}); // [ [fieldId, {value, value_type}], ... ]
        const created = [];
        const updated = [];
        const deleted = [];
        const errors = [];

        // Upsert staged values
        for (const [fieldId, payload] of stagedEntries) {
            const { value, value_type } = payload;
            const current = byFieldId.get(fieldId);

            if (current) {
                // update if changed
                let changed = false;
                if (current.value !== (value ?? '')) {
                    current.value = value ?? '';
                    changed = true;
                }
                if (current.value_type !== (value_type ?? null)) {
                    current.value_type = value_type ?? null;
                    changed = true;
                }
                if (changed) updated.push(current);
            } else {
                // create
                const record = this.store.createRecord('custom-field-value', {
                    custom_field_uuid: fieldId,
                    value: value ?? '',
                    value_type: value_type ?? null,
                });

                created.push(record);
            }
        }

        // Optionally delete records for fields we no longer track
        if (deleteMissing) {
            const stagedIds = new Set(stagedEntries.map(([id]) => id));
            for (const rec of existing) {
                if (!stagedIds.has(rec.custom_field_uuid)) {
                    rec.deleteRecord();
                    deleted.push(rec);
                }
            }
        }

        // Persist if requested
        if (!persist) {
            return { created, updated, deleted, errors };
        }

        try {
            // Save updates first (often fewer)
            await Promise.all(updated.map((rec) => rec.save(adapterOptions ? { adapterOptions } : undefined)));
            // Then saves for new records
            await Promise.all(created.map((rec) => rec.save(adapterOptions ? { adapterOptions } : undefined)));
            // Finally deletions
            await Promise.all(deleted.map((rec) => rec.save(adapterOptions ? { adapterOptions } : undefined)));
        } catch (e) {
            errors.push(e);
        }

        return { created, updated, deleted, errors };
    }

    /**
     * Groups with .customFields attached
     * Returns a *new* array of groups to avoid accidental in-place mutation.
     */
    getGroupedFields() {
        const groups = this.getGroups(); // array of Category models
        const fields = this.getFields(); // array of CustomField models

        // Build groupId -> fields[] map
        const byGroupId = new Map();
        for (let i = 0; i < fields.length; i++) {
            const cf = fields[i];
            const gid = cf.category_uuid || null;
            if (!byGroupId.has(gid)) byGroupId.set(gid, []);
            byGroupId.get(gid).push(cf);
        }

        // Don’t mutate now (we’re likely in a render). If a category needs an update,
        // schedule the write for afterRender.
        // Choose your unique key for comparison: 'id' or 'custom_field_uuid'
        const key = 'id'; // change to 'custom_field_uuid' if that’s your canonical id

        let needsAnyUpdate = false;
        const planned = [];

        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            const computed = byGroupId.get(g.id) || [];

            const prev = g.customFields; // <- no coercion
            const needsInit = !Array.isArray(prev); // undefined / non-array
            const changed = !needsInit && !sameIds(prev, computed, key, false);

            if (needsInit || changed) {
                planned.push({ g, next: computed }); // initialize or update
                needsAnyUpdate = true;
            }
        }

        if (needsAnyUpdate) {
            scheduleOnce('afterRender', null, () => {
                for (let i = 0; i < planned.length; i++) {
                    const { g, next } = planned[i];
                    const current = g.customFields; // no coercion
                    const needsInit = !Array.isArray(current);
                    const changed = !needsInit && !sameIds(current, next, key, false);

                    if (needsInit || changed) {
                        g.customFields = next; // tracked; safe after render
                    }
                }
            });
        }

        // Return the same structure (categories), consumers keep using g.customFields
        return groups;
    }

    getGroupedEntries() {
        return this.getGroupedFields().map((g) => ({ group: g, customFields: g.customFields ?? [] }));
    }

    // ---------- Helpers ----------
    #normalizeValueType(customFieldOrId) {
        if (!customFieldOrId || typeof customFieldOrId === 'string') return null;
        return customFieldOrId.valueType ?? customFieldOrId.value_type ?? null;
    }

    // Pull the staged value (if any) for a field id (string result or undefined)
    #getStagedValue(fieldId) {
        return this.values?.[fieldId]?.value;
    }

    // Resolve the effective value for a field: staged > default_value > null
    #resolvedValue(cf) {
        const staged = this.#getStagedValue(cf.id);
        if (staged !== undefined) return staged; // explicit staging (can be empty string)
        if (cf.default_value != null && cf.default_value !== '') return cf.default_value;
        return null;
    }

    #isPresentForType(value, valueType) {
        switch (valueType) {
            case 'text':
            case 'model':
                // text/model are strings; treat non-empty (after trim) as present
                return typeof value === 'string' && value.trim().length > 0;

            case 'date': {
                if (value == null || value === '') return false;
                const t = Date.parse(value);
                return Number.isFinite(t);
            }

            case 'file':
                // your File value is a JSON string; reuse your rule (must look like {...})
                return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');

            default:
                // fallback: any non-nullish, non-empty string
                return value != null && value !== '';
        }
    }

    /** Find an existing in-memory CFV record for this resource+field (no fetch). */
    #getLocalValueRecord(resource, fieldId) {
        const many = resource.get('custom_field_values');

        if (!many) return null;
        return many.find((r) => r.custom_field_uuid === fieldId) || null;
    }

    /** Ensure relationship contains rec exactly once. */
    #addToHasManyOnce(resource, rec) {
        const many = resource.get('custom_field_values');

        if (!many) return;

        if (!many.includes(rec)) {
            many.pushObject(rec);
        }
    }

    /** Create a *new, unsaved* CFV record. */
    #createLocalValueRecord(fieldId, value, valueType, resource) {
        return this.store.createRecord('custom-field-value', {
            company_uuid: resource.company_uuid,
            custom_field_uuid: fieldId,
            subject_uuid: resource.id,
            value: value,
            value_type: valueType ?? null,
        });
    }
}

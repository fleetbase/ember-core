import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { setOwner, getOwner } from '@ember/application';
import { action } from '@ember/object';
import { isArray } from '@ember/array';

export default class SubjectCustomFields {
    @service store;
    @tracked subject;
    @tracked groups = [];
    @tracked fields = [];
    @tracked values = Object.create(null);

    constructor({ owner, subject }) {
        setOwner(this, getOwner(owner));
        this.subject = subject;
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
        const { group = false } = options;
        const subjectId = this.subject.id;

        const groups = await this.store.query('category', {
            owner_uuid: subjectId,
            for: 'custom_field_group',
        });

        const fields = await this.store.query('custom-field', {
            subject_uuid: subjectId,
        });

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
        const { includeUngrouped = true, stopEarly = false, customMessage } = options;

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
        const { validate = true, deleteMissing = false, persist = false, reloadExisting = false, adapterOptions } = options;

        // 1) Validate requireds
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
                if (current.value !== String(value ?? '')) {
                    current.value = String(value ?? '');
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
                    value: String(value ?? ''),
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
    // Replace getGroupedFields() with this version
    getGroupedFields() {
        const groups = this.getGroups();
        const fields = this.getFields();

        // Map groups by id and ensure each has a customFields array (reactively set)
        const byId = new Map();
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            // ensure property exists; use set? to be safe on Ember Data models
            g.set?.('customFields', g.customFields ?? []);
            // also reassign to a new array so Glimmer picks up changes
            if (g.customFields.length) {
                g.set?.('customFields', [...g.customFields]);
            }
            byId.set(g.id, g);
        }

        // Distribute fields into their group; reassign for reactivity
        for (let i = 0; i < fields.length; i++) {
            const cf = fields[i];
            const g = byId.get(cf.category_uuid);
            if (g) {
                const next = (g.customFields ?? []).concat(cf);
                g.set?.('customFields', next);
            }
        }

        // Return the array of *group records*, each with .customFields attached
        return Array.from(byId.values());
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
}

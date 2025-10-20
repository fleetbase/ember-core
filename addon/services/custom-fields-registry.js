import ResourceActionService from './resource-action';
import SubjectCustomFields from '../library/subject-custom-fields';
import { inject as service } from '@ember/service';
import { debug } from '@ember/debug';
import { task } from 'ember-concurrency';
import getModelName from '../utils/get-model-name';
import isObject from '../utils/is-object';

export default class CustomFieldsRegistryService extends ResourceActionService {
    @service store;
    @service resourceContextPanel;
    @service modalsManager;
    #cache = new WeakMap();
    modelNamePath = 'label';

    panel = {
        create: (attributes = {}, options = {}, saveOptions = {}) => {
            saveOptions = { ...(options?.saveOptions ?? {}), ...saveOptions };
            const customField = this.createNewInstance(attributes);
            return this.resourceContextPanel.open({
                content: 'custom-field/form',
                title: 'Create a new custom field',
                panelContentClass: 'py-2 px-4',
                useDefaultSaveTask: true,
                saveOptions: {
                    callback: this.refresh,
                    ...saveOptions,
                },
                customField,
                ...options,
            });
        },
        edit: (customField, options = {}, saveOptions = {}) => {
            saveOptions = { ...(options?.saveOptions ?? {}), ...saveOptions };
            return this.resourceContextPanel.open({
                content: 'custom-field/form',
                title: `Edit: ${customField.label}`,
                panelContentClass: 'py-2 px-4',
                useDefaultSaveTask: true,
                customField,
                saveOptions,
                ...options,
            });
        },
    };

    modal = {
        create: (attributes = {}, options = {}, saveOptions = {}) => {
            saveOptions = { ...(options?.saveOptions ?? {}), ...saveOptions };
            const customField = this.createNewInstance(attributes);
            return this.modalsManager.show('modals/resource', {
                resource: customField,
                title: 'Create a new custom field',
                acceptButtonText: 'Create Custom Field',
                component: 'custom-field/form',
                confirm: (modal) => this.modalTask.perform(modal, 'saveTask', customField, { refresh: true, ...saveOptions }),
                ...options,
            });
        },
        edit: (customField, options = {}, saveOptions = {}) => {
            saveOptions = { ...(options?.saveOptions ?? {}), ...saveOptions };
            return this.modalsManager.show('modals/resource', {
                resource: customField,
                title: `Edit custom field: ${customField.label}`,
                acceptButtonText: 'Save Changes',
                saveButtonIcon: 'save',
                component: 'custom-field/form',
                confirm: (modal) => this.modalTask.perform(modal, 'saveTask', customField, { refresh: true, ...saveOptions }),
                ...options,
            });
        },
    };

    @task *loadSubjectCustomFields(subject, options = {}) {
        try {
            const manager = this.forSubject(subject, options);
            yield manager.load({ group: true });
            return manager;
        } catch (err) {
            console.error(err);
            debug('[Custom Fields Registry] Unable to load custom fields manager: ' + err.message);
        }
    }

    /**
     * Get (or create) a SubjectCustomFields manager for this subject
     */
    forSubject(subject, options = {}) {
        if (!subject || !isObject(subject)) {
            throw new Error('custom-fields-registry: subject must be an object');
        }

        let scopes = this.#cache.get(subject);
        if (!scopes) {
            scopes = new Map();
            this.#cache.set(subject, scopes);
        }

        const key = this.#scopeKey(subject, options);
        let manager = scopes.get(key);

        if (!manager) {
            manager = new SubjectCustomFields({ owner: this, subject, options });
            scopes.set(key, manager);
        } else {
            // keep them fresh if caller passes new ones
            manager.subject = subject;
            manager.options = { ...(manager.options || {}), ...(options || {}) };
        }

        return manager;
    }

    #scopeKey(subject, options = {}) {
        const lo = options.loadOptions || options;
        const groupedFor = lo.groupedFor ?? 'custom_field_group';
        const fieldFor = lo.fieldFor ?? `subject:${getModelName(subject)}`;
        return `${groupedFor}::${fieldFor}`;
    }

    getSubjectCacheKey(subject, options) {
        const lo = options.loadOptions || options;
        const groupedFor = lo.groupedFor || 'custom_field_group';
        const fieldFor = lo.fieldFor || `subject:${getModelName(subject)}`;

        return subject?.id ?? `${groupedFor}:${fieldFor}`;
    }

    // Optional proxy methods if you prefer service ergonomics:
    set(subject, fieldOrId, value, valueType) {
        return this.forSubject(subject).set(fieldOrId, value, valueType);
    }

    setProperties(subject, entries) {
        return this.forSubject(subject).setProperties(entries);
    }

    get(subject, customFieldId) {
        return this.forSubject(subject).get(customFieldId);
    }

    getProperties(subject) {
        return this.forSubject(subject).getProperties();
    }

    clear(subject) {
        return this.forSubject(subject).clear();
    }

    serialize(subject) {
        return this.forSubject(subject).serialize();
    }

    load(subject, opts) {
        return this.forSubject(subject).load(opts);
    }

    getFields(subject) {
        return this.forSubject(subject).getFields();
    }

    getGroups(subject) {
        return this.forSubject(subject).getGroups();
    }

    getGroupedFields(subject) {
        return this.forSubject(subject).getGroupedFields();
    }
}

import ResourceActionService from './resource-action';
import SubjectCustomFields from '../library/subject-custom-fields';
import { inject as service } from '@ember/service';
import { debug } from '@ember/debug';
import { task } from 'ember-concurrency';

export default class CustomFieldsRegistryService extends ResourceActionService {
    @service store;
    #cache = new WeakMap();

    @task *loadSubjectCustomFields(subject) {
        try {
            const manager = this.forSubject(subject);
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
    forSubject(subject) {
        if (!subject) throw new Error('custom-fields-registry: subject is required');
        let manager = this.#cache.get(subject);
        if (!manager) {
            manager = new SubjectCustomFields({ owner: this, subject });
            this.#cache.set(subject, manager);
        }
        return manager;
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

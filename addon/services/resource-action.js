import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { debug } from '@ember/debug';
import { getOwner } from '@ember/application';
import { task, timeout } from 'ember-concurrency';
import { pluralize } from 'ember-inflector';
import titleize from 'ember-cli-string-helpers/utils/titleize';
import getModelName from '../utils/get-model-name';

/**
 * Base ResourceActionService that provides common CRUD operations and utilities
 * for all model-specific action services in FleetOps.
 *
 * This service uses ember-concurrency for all asynchronous operations to provide
 * better control over task execution, cancellation, and error handling.
 */
export default class ResourceActionService extends Service {
    @service store;
    @service notifications;
    @service intl;
    @service modalsManager;
    @service crud;
    @service fetch;
    @service currentUser;
    @service abilities;
    @service tableContext;
    @service resourceContextPanel;
    // @service hostRouter;

    /** lookup application router */
    get hostRouter() {
        return getOwner(this).lookup('router:main');
    }

    /**
     * The model name this service operates on.
     * Should be overridden in child services.
     */
    @tracked modelName = null;

    /**
     * The model name path to get the name attribute of the contexted model.
     * Should be overridden in child services.
     */
    @tracked modelNamePath = 'name';

    /**
     * Default attributes to apply when creating new records.
     * Should be overridden in child services as needed.
     */
    @tracked defaultAttributes = {};

    /**
     * Permission prefix for this resource.
     * Should be overridden in child services.
     */
    @tracked permissionPrefix = 'fleet-ops';

    /**
     * The engine mounted prefix
     */
    @tracked mountPrefix = 'fleet-ops';

    /**
     * Initialize the service for store actions
     */
    initialize(modelName, options = {}) {
        this.modelName = modelName;
        this.modelNamePath = options.modelNamePath ?? 'name';
        this.defaultAttributes = { ...this.defaultAttributes, ...(options.defaultAttributes ?? {}) };
        this.permissionPrefix = options.permissionPrefix ?? 'fleet-ops';
        this.mountPrefix = options.mountPrefix ?? `console.${this.permissionPrefix}`;

        return this;
    }

    /**
     * Convenience method to create a record.
     */
    @action create(attributes = {}) {
        return this.createTask.perform(attributes);
    }

    /**
     * Convenience method to update a record.
     */
    @action update(record) {
        return this.updateTask.perform(record);
    }

    /**
     * Convenience method to delete a record.
     */
    @action delete(record, options = {}) {
        return this.deleteTask.perform(record, options);
    }

    /**
     * Convenience method to bulk delete records.
     */
    @action bulkDelete(records, options = {}) {
        console.log(this.tableContext);
        return this.crud.bulkDelete(this.tableContext.getSelectedRows(), {
            modelNamePath: this.modelNamePath,
            acceptButtonText: this.intl.t('common.bulk-delete-resource', { resource: pluralize(titleize(this.modelName)) }),
            onSuccess: async () => {
                await this.hostRouter.refresh();
                this.tableContext.untoggleSelectAll();
            },
        });
    }

    /**
     * Convenience method to export records.
     */
    @action export(options = {}) {
        const selections = this.tableContext.getSelectedIds();
        return this.crud.export(this.modelName, { params: { selections }, ...options });
    }

    /**
     * Convenience method to import records.
     */
    @action import(options = {}) {
        return this.crud.import(this.modelName, {
            onImportCompleted: () => {
                this.hostRouter.refresh();
            },
            onImportTemplate: () => {
                window.open(this.#getImportTemplate());
            },
            ...options,
        });
    }

    /**
     * Convenience method to search records.
     */
    @action search(query, options = {}) {
        return this.searchTask.perform(query, options);
    }

    /**
     * Refreshes the current route.
     */
    @action refresh() {
        return this.hostRouter.refresh();
    }

    /**
     * Transitions to a specific route.
     */
    @action transitionTo(routeName, ...args) {
        return this.hostRouter.transitionTo(`${this.mountPrefix}.${routeName}`, ...args);
    }

    /**
     * Creates a new record with the given attributes.
     * Uses ember-concurrency for async handling.
     */
    @task *createTask(attributes = {}, opts = {}) {
        try {
            const mergedAttributes = { ...this.defaultAttributes, ...attributes };
            const record = this.store.createRecord(this.modelName, mergedAttributes);

            yield record.save();

            this.notifications.success(
                this.intl.t('common.created-successfully', {
                    resource: record[this.modelNamePath] ?? getModelName(record),
                })
            );

            if (opts.refresh) {
                this.refresh();
            }

            if (typeof opts.callback === 'function') {
                opts.callback(record);
            }

            return record;
        } catch (error) {
            this.notifications.serverError(error);
            throw error;
        }
    }

    /**
     * Updates an existing record.
     * Uses ember-concurrency for async handling.
     */
    @task *updateTask(record, opts = {}) {
        try {
            yield record.save();

            this.notifications.success(
                this.intl.t('common.updated-successfully', {
                    resource: record[this.modelNamePath] ?? getModelName(record),
                })
            );

            if (opts.refresh) {
                this.refresh();
            }

            if (typeof opts.callback === 'function') {
                opts.callback(record);
            }

            return record;
        } catch (error) {
            this.notifications.serverError(error);
            throw error;
        }
    }

    /**
     * Updates an existing record.
     * Uses ember-concurrency for async handling.
     */
    @task *saveTask(record, opts = {}) {
        const isNew = record?.isNew;

        try {
            yield record.save();

            this.notifications.success(
                this.intl.t('common.saved-successfully', {
                    resource: record[this.modelNamePath] ?? getModelName(record),
                    action: isNew ? 'created' : 'updated',
                })
            );

            if (opts.refresh) {
                this.refresh();
            }

            if (typeof opts.callback === 'function') {
                opts.callback(record);
            }

            return record;
        } catch (error) {
            this.notifications.serverError(error);
            throw error;
        }
    }

    /**
     * Perform an action task for a modal
     */
    @task *modalTask(modal, task, ...rest) {
        if (!this[task]) return;

        modal.startLoading();
        try {
            const result = yield this[task].perform(...rest);
            return result;
        } catch (err) {
            debug('Modal task failed: ' + err.message);
        } finally {
            modal.stopLoading();
        }
    }

    /**
     * Deletes a record with confirmation dialog.
     * Uses ember-concurrency for async handling.
     */
    @task *deleteTask(record, opts = {}) {
        try {
            yield record.destroyRecord();

            this.notifications.success(
                this.intl.t('common.deleted-successfully', {
                    resource: record[this.modelNamePath] ?? getModelName(record),
                })
            );

            if (opts.refresh) {
                this.refresh();
            }

            if (typeof opts.callback === 'function') {
                opts.callback(record);
            }

            return record;
        } catch (error) {
            this.notifications.serverError(error);
            throw error;
        }
    }

    /**
     * Searches for records with debouncing.
     * Uses ember-concurrency for async handling with restartable behavior.
     */
    @task({ restartable: true }) *searchTask(query, options = {}) {
        if (!query) {
            return [];
        }

        // Debounce search requests
        yield timeout(options.debounceMs || 250);

        try {
            const searchOptions = {
                query,
                limit: options.limit || 10,
                ...options.params,
            };

            const results = yield this.store.query(this.modelName, searchOptions);
            return results;
        } catch (error) {
            this.notifications.serverError(error);
            throw error;
        }
    }

    /**
     * Utility task for searching on a controller.
     * Uses ember-concurrency for async handling with restartable behavior.
     */
    @task({ restartable: true }) *controllerSearchTask(controller, event) {
        const {
            target: { value },
        } = event;
        if (!value) return (controller.query = null);

        yield timeout(250);
        if (controller.page > 1) controller.page = 1;
        controller.query = value;
    }

    /**
     * Creates a new model instance
     */
    createNewInstance(attributes = {}) {
        return this.store.createRecord(this.modelName, { ...this.defaultAttributes, ...attributes });
    }

    /**
     * Checks if the current user has permission for an action.
     */
    can(action, resource = null) {
        const permission = `${this.permissionPrefix} ${action} ${resource || this.modelName}`;
        return this.abilities.can(permission);
    }

    /**
     * Checks if the current user cannot perform an action.
     */
    cannot(action, resource = null) {
        return !this.can(action, resource);
    }

    /**
     * Gets the save permission for this resource.
     */
    get savePermission() {
        return `${this.permissionPrefix} update ${this.modelName}`;
    }

    /**
     * Gets the create permission for this resource.
     */
    get createPermission() {
        return `${this.permissionPrefix} create ${this.modelName}`;
    }

    /**
     * Gets the delete permission for this resource.
     */
    get deletePermission() {
        return `${this.permissionPrefix} delete ${this.modelName}`;
    }

    /**
     * Gets the view permission for this resource.
     */
    get viewPermission() {
        return `${this.permissionPrefix} view ${this.modelName}`;
    }

    #getImportTemplate() {
        const templateModelName = this.modelName
            .replace(/[-_]/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('_');
        const baseAssetUrl = this.baseAssetUrl ?? 'https://flb-assets.s3.ap-southeast-1.amazonaws.com';

        return `${baseAssetUrl}/import-templates/Fleetbase_${templateModelName}_Import_Template.xlsx`;
    }
}

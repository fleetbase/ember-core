import Service, { inject as service, inject } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action, get } from '@ember/object';
import { alias } from '@ember/object/computed';
import { isArray } from '@ember/array';
import { debug } from '@ember/debug';
import { getOwner } from '@ember/application';
import { task, timeout } from 'ember-concurrency';
import { pluralize } from 'ember-inflector';
import titleize from 'ember-cli-string-helpers/utils/titleize';
import getModelName from '../utils/get-model-name';

export { service, inject };
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
    @service universe;
    @service events;

    /**
     * Getter for router, attempt to use hostRouter if from engine
     * fallback to application router service, and last fallback to internal router
     *
     * @readonly
     * @memberof ResourceActionService
     */
    get router() {
        const owner = getOwner(this);
        return owner.lookup('service:host-router') ?? owner.lookup('service:router') ?? owner.lookup('router:main');
    }

    /** Alias the router for engines consuming */
    @alias('router') hostRouter;

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
     * Global additional options for bulk delete action.
     */
    @tracked bulkDeleteOptions = {};

    /**
     * Global additional options for import action.
     */
    @tracked importOptions = {};

    /**
     * Global additional options for export action.
     */
    @tracked exportOptions = {};

    /**
     * Global fetch options which applies to all fetch methods.
     */
    @tracked fetchOptions = {};

    /**
     * The import template path.
     */
    @tracked importTemplatePath = 'import-templates';

    /**
     * The import template name.
     */
    @tracked importTemplateName = null;

    /**
     * The base URL for static assets.
     */
    @tracked baseAssetUrl = null;

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
     * The engine that owns this resource's views, used in its registry names.
     * Derived from `mountPrefix` (`console.fleet-ops` → `fleet-ops`).
     */
    @tracked registryExtension = 'fleet-ops';

    /**
     * The resource segment of this resource's registry names. Derived from the
     * model name without its engine prefix (`ledger-invoice` → `invoice`).
     */
    @tracked registryResource = null;

    /**
     * The shared resource view registry service.
     *
     * Looked up rather than injected: an engine built against an older
     * ember-core does not list it as a dependency, and a missing registry must
     * leave the view exactly as it was.
     */
    get resourceView() {
        return getOwner(this).lookup('service:universe/resource-view-service') ?? null;
    }

    /**
     * The table registry prefix for this resource, e.g. `fleet-ops:table:driver`.
     * Pass it to `<Layout::Resource::Tabular @registry=…>`.
     */
    get tableRegistry() {
        return this.registryResource ? `${this.registryExtension}:table:${this.registryResource}` : null;
    }

    /**
     * The details registry prefix for this resource, e.g. `fleet-ops:details:driver`.
     * Pass it to `<Layout::Resource::Panel @registry=…>`.
     */
    get detailsRegistry() {
        return this.registryResource ? `${this.registryExtension}:details:${this.registryResource}` : null;
    }

    /**
     * Merge what extensions registered into one of this resource's view slots.
     * Returns the built-in items unchanged when nothing is registered.
     *
     * @param {String} surface 'table' or 'details'
     * @param {String} slot e.g. 'columns', 'actions', 'menu'
     * @param {Array} baseItems The view's built-in items
     * @param {Object} context Extra view context (`resource`, `controller`, …)
     * @returns {Array}
     */
    mergeRegistered(surface, slot, baseItems = [], context = {}) {
        const prefix = surface === 'details' ? this.detailsRegistry : this.tableRegistry;
        if (!prefix || !this.resourceView) {
            return baseItems;
        }

        return this.resourceView.mergeSlot(prefix, slot, baseItems, context);
    }

    /**
     * This resource's table columns with registered columns and row actions
     * merged in. For views that render their own `<Table>` rather than
     * `<Layout::Resource::Tabular @registry=…>`, which merges by itself.
     *
     * @param {Array} columns The view's built-in columns
     * @param {Object} context Extra view context (`controller`, `table`, …)
     * @returns {Array}
     */
    mergeRegisteredColumns(columns = [], context = {}) {
        if (!this.tableRegistry || !this.resourceView) {
            return columns;
        }

        const merged = this.resourceView.mergeSlot(this.tableRegistry, 'columns', columns, context);
        return this.resourceView.mergeRowActions(this.tableRegistry, merged, context);
    }

    /**
     * The query params this resource's index controller must declare: its
     * own, plus the filter params of filterable registered columns. Use it for
     * the controller's `queryParams` class field.
     *
     * @param {Array} baseQueryParams
     * @returns {Array}
     */
    queryParamsFor(baseQueryParams = []) {
        if (!this.registryResource || !this.resourceView) {
            return baseQueryParams;
        }

        return this.resourceView.queryParamsFor(this.registryExtension, this.registryResource, baseQueryParams);
    }

    /**
     * Initialize the service for store actions
     */
    initialize(modelName, options = {}) {
        this.modelName = modelName;
        this.modelNamePath = options.modelNamePath ?? this.modelNamePath;
        this.defaultAttributes = { ...this.defaultAttributes, ...(options.defaultAttributes ?? {}) };
        this.bulkDeleteOptions = { ...this.bulkDeleteOptions, ...(options.bulkDeleteOptions ?? {}) };
        this.importOptions = { ...this.importOptions, ...(options.importOptions ?? {}) };
        this.exportOptions = { ...this.exportOptions, ...(options.exportOptions ?? {}) };
        this.fetchOptions = { ...this.fetchOptions, ...(options.fetchOptions ?? {}) };
        this.importTemplateName = options.importTemplateName ?? this.importTemplateName;
        this.importTemplatePath = options.importTemplatePath ?? this.importTemplatePath;
        this.baseAssetUrl = options.baseAssetUrl ?? this.baseAssetUrl;
        this.permissionPrefix = options.permissionPrefix ?? 'fleet-ops';
        this.mountPrefix = options.mountPrefix ?? `console.${this.permissionPrefix}`;
        this.registryExtension = options.registryExtension ?? this.mountPrefix.replace(/^console\./, '');
        this.registryResource = options.registryResource ?? modelName?.replace(new RegExp(`^${this.registryExtension}-`), '') ?? null;

        return this;
    }

    /**
     * Tiny helper to get the record name
     */
    getRecordName(record) {
        return get(record, this.modelNamePath) ?? get(record, 'name') ?? get(record, 'display_name') ?? get(record, 'public_id') ?? getModelName(record);
    }

    /**
     * Convenience method to create a record.
     */
    @action create(attributes = {}, options = {}) {
        return this.createTask.perform(attributes, options);
    }

    /**
     * Convenience method to update a record.
     */
    @action update(record, options = {}) {
        return this.updateTask.perform(record, options);
    }

    /**
     * Convenience method to delete a record.
     */
    @action delete(record, options = {}, deleteOptions = {}) {
        const taskOptions = { ...deleteOptions, ...(options.taskOptions ?? {}) };
        this.modalsManager.confirm({
            title: this.intl.t('common.delete-resource-named', { resource: titleize(this.modelName), resourceName: this.getRecordName(record) }) + '?',
            body: this.intl.t('common.delete-resource-prompt'),
            acceptButtonText: this.intl.t('common.confirm-delete'),
            acceptButtonType: 'danger',
            acceptButtonIcon: 'trash',
            confirm: async (modal) => {
                modal.startLoading();

                try {
                    await this.deleteTask.perform(record, taskOptions);
                    modal.done();
                } catch (error) {
                    this.notifications.serverError(error);
                    modal.stopLoading();
                }
            },
            ...options,
        });
    }

    /**
     * Convenient "continue without saving" prompt that handles rollback and redirect.
     *
     * @param {*} model
     * @param {*} [options={}]
     * @return {*}
     * @memberof ResourceActionService
     */
    @action confirmContinueWithUnsavedChanges(model, options = {}) {
        return this.modalsManager.confirm({
            title: this.intl.t('common.continue-without-saving'),
            body: this.intl.t('common.continue-without-saving-prompt', { resource: titleize(this.modelName) }),
            acceptButtonText: this.intl.t('common.continue'),
            confirm: async () => {
                model.rollbackAttributes();
                if (options.redirectTo) {
                    await this.hostRouter.transitionTo(options.redirectTo, model);
                }
            },
            ...options,
        });
    }

    /**
     * Convenience method to bulk delete records.
     */
    @action bulkDelete(selected = [], options = {}) {
        selected = [...(isArray(selected) ? selected : []), ...this.tableContext.getSelectedRows()];
        if (!selected) return;

        options = { ...options, ...(this.bulkDeleteOptions ?? {}) };
        // if no direct fetchOptions use global fetch options if applicable
        if (!options.fetchOptions) {
            options.fetchOptions = this.fetchOptions ?? {};
        }

        return this.crud.bulkDelete(selected, {
            modelNamePath: this.modelNamePath,
            acceptButtonText: this.intl.t('common.bulk-delete-resource', { resource: pluralize(titleize(this.modelName)) }),
            onSuccess: async () => {
                await this.router.refresh();
                this.tableContext.untoggleSelectAll();
            },
            ...options,
        });
    }

    /**
     * Convenience method to export records.
     */
    @action export(selections = [], options = {}) {
        selections = [...(isArray(selections) ? selections : []), ...this.tableContext.getSelectedIds()];
        if (!selections) return;

        options = { ...options, ...(this.exportOptions ?? {}) };
        // if no direct fetchOptions use global fetch options if applicable
        if (!options.fetchOptions) {
            options.fetchOptions = this.fetchOptions ?? {};
        }

        return this.crud.export(this.modelName, { params: { selections }, ...options });
    }

    /**
     * Convenience method to import records.
     */
    @action import(options = {}) {
        options = { ...options, ...(this.importOptions ?? {}) };
        // if no direct fetchOptions use global fetch options if applicable
        if (!options.fetchOptions) {
            options.fetchOptions = this.fetchOptions ?? {};
        }

        return this.crud.import(this.modelName, {
            onImportCompleted: () => {
                this.router.refresh();
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
        return this.router.refresh();
    }

    /**
     * Transitions to a specific route.
     */
    @action transitionTo(routeName, ...args) {
        return this.router.transitionTo(`${this.mountPrefix}.${routeName}`, ...args);
    }

    /**
     * Creates a new record with the given attributes.
     * Uses ember-concurrency for async handling.
     */
    @task *createTask(attributes = {}, options = {}) {
        try {
            const mergedAttributes = { ...this.defaultAttributes, ...attributes };
            const record = this.store.createRecord(this.modelName, mergedAttributes);

            yield record.save();

            this.notifications.success(
                this.intl.t('common.resource-created-success-name', {
                    resource: titleize(this.modelName),
                    resourceName: this.getRecordName(record),
                })
            );

            // Track creation event
            this.events.trackResourceCreated(record);

            if (options.refresh) {
                this.refresh();
            }

            if (typeof options.callback === 'function') {
                options.callback(record);
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
    @task *updateTask(record, options = {}) {
        try {
            yield record.save();

            this.notifications.success(
                this.intl.t('common.resource-updated-success', {
                    resource: titleize(this.modelName),
                    resourceName: this.getRecordName(record),
                })
            );

            // Track update event
            this.events.trackResourceUpdated(record);

            if (options.refresh) {
                this.refresh();
            }

            if (typeof options.callback === 'function') {
                options.callback(record);
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
    @task *saveTask(record, options = {}) {
        const isNew = record?.isNew;

        try {
            yield record.save();

            this.notifications.success(
                this.intl.t('common.resource-action-success', {
                    resource: titleize(this.modelName),
                    resourceName: this.getRecordName(record),
                    action: isNew ? 'created' : 'updated',
                })
            );

            // Track save event (create or update)
            if (isNew) {
                this.events.trackResourceCreated(record);
            } else {
                this.events.trackResourceUpdated(record);
            }

            if (options.refresh) {
                this.refresh();
            }

            if (typeof options.callback === 'function') {
                options.callback(record);
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
    @task *deleteTask(record, options = {}) {
        try {
            yield record.destroyRecord();

            this.notifications.success(
                this.intl.t('common.resource-deleted', {
                    resource: titleize(this.modelName),
                    resourceName: this.getRecordName(record),
                })
            );

            // Track deletion event
            this.events.trackResourceDeleted(record);

            if (options.refresh) {
                this.refresh();
            }

            if (typeof options.callback === 'function') {
                options.callback(record);
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
        if (!query) return [];

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
        const importTemplatePath = this.importTemplatePath ?? 'import-templates';
        const importTemplateName = this.importTemplateName ?? `Fleetbase_${templateModelName}_Import_Template.xlsx`;

        return `${baseAssetUrl}/${importTemplatePath}/${importTemplateName}`;
    }
}

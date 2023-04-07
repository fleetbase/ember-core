import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { isArray } from '@ember/array';
import { dasherize } from '@ember/string';
import { pluralize } from 'ember-inflector';
import { format as formatDate } from 'date-fns';
import getModelName from '../utils/get-model-name';
import humanize from '../utils/humanize';
import first from '../utils/first';

export default class CrudService extends Service {
    /**
     * Inject the `fetch` service
     *
     * @var {Service}
     */
    @service fetch;

    /**
     * Inject the `modalsManager` service
     *
     * @var {Service}
     */
    @service modalsManager;

    /**
     * Inject the `notifications` service
     *
     * @var {Service}
     */
    @service notifications;

    /**
     * Inject the `store` service
     *
     * @var {Service}
     */
    @service store;

    /**
     * Closes a current modal then opens another modal action
     *
     * @void
     */
    @action next() {
        const args = [...arguments];
        const nextAction = args[0];

        // shift off the action
        args.shift();

        this.modalsManager.done().then(() => {
            if (typeof this[nextAction] === 'function') {
                this[nextAction](...args);
            }
        });
    }

    /**
     * Generic deletion modal with options
     *
     * @param {Model} model
     * @param {Object} options
     * @void
     */
    @action delete(model, options = {}) {
        const modelName = getModelName(model);

        this.modalsManager.confirm({
            title: `Are you sure to delete this ${options.modelName || humanize(modelName).toLowerCase()}?`,
            args: ['model'],
            model,
            confirm: (modal) => {
                modal.startLoading();
                return model.destroyRecord().then((model) => {
                    this.notifications.success(options.successNotification || `'${options.modelName || model.name || humanize(modelName)}' has been deleted.`);
                });
            },
            ...options,
        });
    }

    /**
     * Generic deletion modal with options
     *
     * @param {Array} selected an array of selected models for deletion
     * @param {Object} options
     * @void
     */
    @action bulkDelete(selected, options = {}) {
        if (!isArray(selected) || selected.length === 0) {
            return;
        }

        const firstModel = first(selected);
        const modelName = getModelName(firstModel, options?.modelName);

        // make sure all are the same type
        selected = selected.filter((m) => getModelName(m) === modelName);

        return this.bulkAction('delete', selected, {
            acceptButtonScheme: 'danger',
            acceptButtonIcon: 'trash',
            actionPath: `${dasherize(pluralize(modelName))}/bulk-delete`,
            actionMethod: `DELETE`,
            ...options,
        });
    }

    /**
     * Generic bulk action on multiple models modal with options
     *
     * @param {Array} selected an array of selected models for deletion
     * @param {Object} options
     * @void
     */
    @action bulkAction(verb, selected, options = {}) {
        if (!isArray(selected) || selected.length === 0) {
            return;
        }

        const firstModel = first(selected);
        const modelName = getModelName(firstModel);
        const count = selected.length;
        const actionMethod = (typeof options.actionMethod === 'string' ? options.actionMethod : `POST`).toLowerCase();

        this.modalsManager.show('modals/bulk-action-model', {
            title: `Bulk ${verb} ${pluralize(modelName)}`,
            acceptButtonText: humanize(verb),
            args: ['selected'],
            modelNamePath: 'name',
            verb,
            selected,
            count,
            modelName,
            remove: (model) => {
                selected.removeObject(model);
                this.modalsManager.setOption('selected', selected);
            },
            confirm: (modal) => {
                const selected = modal.getOption('selected');

                modal.startLoading();

                return this.fetch[actionMethod](options.actionPath, {
                    ids: selected.map((model) => model.id),
                })
                    .then((response) => {
                        this.notifications.success(response.message ?? options.successNotification ?? `${count} ${pluralize(modelName, count)} were updated successfully.`);

                        if (typeof options.onSuccess === 'function') {
                            options.onSuccess(selected);
                        }
                    })
                    .catch((error) => {
                        this.notifications.serverError(error);

                        if (typeof options.onError === 'function') {
                            options.onError(error, selected);
                        }
                    })
                    .finally(() => {
                        if (typeof options.callback === 'function') {
                            options.callback(selected);
                        }
                    });
            },
            ...options,
        });
    }

    /**
     * Toggles dialog to export resource data
     *
     * @void
     */
    @action export(modelName, options = {}) {
        // always lowercase modelname
        modelName = modelName.toLowerCase();

        // set the model uri endpoint
        const modelEndpoint = dasherize(pluralize(modelName));

        this.modalsManager.show('modals/export-form', {
            title: `Export ${pluralize(modelName)}`,
            acceptButtonText: 'Download',
            formatOptions: ['csv', 'xlsx', 'xls', 'html', 'pdf'],
            setFormat: ({ target }) => {
                this.modalsManager.setOption('format', target.value || null);
            },
            confirm: (modal, done) => {
                const format = modal.getOption('format') || 'xlsx';
                modal.startLoading();
                return this.fetch
                    .download(
                        `${modelEndpoint}/export`,
                        {
                            format,
                        },
                        {
                            fileName: `${modelEndpoint}-${formatDate(new Date(), 'yyyy-MM-dd-HH:mm')}.${format}`,
                        }
                    )
                    .then(() => {
                        setTimeout(() => {
                            return done();
                        }, 600);
                    })
                    .catch((error) => {
                        modal.stopLoading();
                        this.notifications.serverError(error, 'Unable to download API credentials export.');
                    });
            },
            ...options,
        });
    }
}

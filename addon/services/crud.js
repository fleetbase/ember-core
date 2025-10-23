import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { action, get } from '@ember/object';
import { isArray } from '@ember/array';
import { dasherize } from '@ember/string';
import { later } from '@ember/runloop';
import { pluralize } from 'ember-inflector';
import { format as formatDate } from 'date-fns';
import smartHumanize from '@fleetbase/ember-ui/utils/smart-humanize';
import getModelName from '../utils/get-model-name';
import getWithDefault from '../utils/get-with-default';
import first from '../utils/first';

export default class CrudService extends Service {
    @service fetch;
    @service modalsManager;
    @service notifications;
    @service store;
    @service currentUser;

    /**
     * Generic deletion modal with options
     *
     * @param {Model} model
     * @param {Object} options
     * @void
     */
    @action delete(model, options = {}) {
        const modelName = getModelName(model, get(options, 'modelName'), { humanize: true, capitalizeWords: true });
        const successNotification = options?.successNotification || `${model.name ? modelName + " '" + model.name + "'" : "'" + modelName + "'"} has been deleted.`;

        this.modalsManager.confirm({
            title: `Are you sure to delete this ${modelName}?`,
            args: ['model'],
            model,
            confirm: async (modal) => {
                if (typeof options.onTrigger === 'function') {
                    options.onTrigger(model);
                }

                modal.startLoading();

                try {
                    const response = await model.destroyRecord();
                    this.notifications.success(successNotification);
                    if (typeof options.onSuccess === 'function') {
                        options.onSuccess(model);
                    }

                    return response;
                } catch (error) {
                    this.notifications.serverError(error);

                    if (typeof options.onError === 'function') {
                        options.onError(error, model);
                    }
                } finally {
                    if (typeof options.callback === 'function') {
                        options.callback(model);
                    }
                }
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
        const modelName = getModelName(firstModel, get(options, 'modelName'), { humanize: true, capitalizeWords: true });

        // make sure all are the same type
        selected = selected.filter((m) => getModelName(m) === getModelName(firstModel));

        return this.bulkAction('delete', selected, {
            acceptButtonScheme: 'danger',
            acceptButtonIcon: 'trash',
            actionPath: `${dasherize(pluralize(modelName))}/bulk-delete`,
            actionMethod: `DELETE`,
            modelName,
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
        const modelName = getModelName(firstModel, get(options, 'modelName'), { humanize: true, capitalizeWords: true });
        const count = selected.length;
        const actionMethod = (typeof options.actionMethod === 'string' ? options.actionMethod : `POST`).toLowerCase();
        const modalTemplate = getWithDefault(options, 'template', 'modals/bulk-action-model');
        const successMessage = options?.successNotification ?? `${count} ${pluralize(count, modelName)} were updated successfully.`;

        if (typeof options.resolveModelName === 'function') {
            selected = selected.map((model) => {
                const resolvedModelName = options.resolveModelName(model);
                if (typeof resolvedModelName === 'string') {
                    model.set('list_resolved_name', resolvedModelName);
                }

                return model;
            });
        }

        this.modalsManager.show(modalTemplate, {
            title: `Bulk ${verb} ${pluralize(smartHumanize(modelName))}`,
            acceptButtonText: smartHumanize(verb),
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
            confirm: async (modal) => {
                const selected = modal.getOption('selected');
                const fetchParams = modal.getOption('fetchParams', {});
                const fetchOptions = modal.getOption('fetchOptions', {});
                const callback = modal.getOption('callback');

                if (typeof options.withSelected === 'function') {
                    options.withSelected(selected);
                }

                modal.startLoading();

                try {
                    const response = await this.fetch.request(
                        options.actionPath,
                        actionMethod,
                        {
                            body: JSON.stringify({
                                ids: selected.map((model) => model.id),
                                ...fetchParams,
                            }),
                        },
                        fetchOptions
                    );

                    this.notifications.success(response.message ?? successMessage);
                    if (typeof options.onSuccess === 'function') {
                        options.onSuccess(selected);
                    }

                    return response;
                } catch (error) {
                    console.error(error.message, error);
                    this.notifications.serverError(error);

                    if (typeof options.onError === 'function') {
                        options.onError(error, selected);
                    }
                } finally {
                    if (typeof callback === 'function') {
                        callback(selected);
                    }
                }
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
        const exportParams = options?.params ?? {};
        const fetchOptions = options?.fetchOptions ?? {};
        const exportEndpoint = options?.exportEndpoint ?? options?.actionPath ?? `${modelEndpoint}/export`;

        this.modalsManager.show('modals/export-form', {
            title: `Export ${pluralize(smartHumanize(modelName))}`,
            acceptButtonText: 'Download',
            modalClass: 'modal-sm',
            format: 'xlsx',
            formatOptions: ['csv', 'xlsx', 'xls', 'html', 'pdf'],
            setFormat: ({ target }) => {
                this.modalsManager.setOption('format', target.value || null);
            },
            confirm: (modal, done) => {
                const format = modal.getOption('format') ?? 'xlsx';
                modal.startLoading();
                return this.fetch
                    .download(
                        exportEndpoint,
                        {
                            format,
                            ...exportParams,
                        },
                        {
                            method: 'POST',
                            fileName: `${modelEndpoint}-${formatDate(new Date(), 'yyyy-MM-dd-HH:mm')}.${format}`,
                            ...fetchOptions,
                        }
                    )
                    .then(() => {
                        later(
                            this,
                            () => {
                                return done();
                            },
                            600
                        );
                    })
                    .catch((error) => {
                        modal.stopLoading();
                        this.notifications.serverError(error, 'Unable to download API credentials export.');
                    });
            },
            ...options,
        });
    }

    /**
     * Prompts a spreadsheet upload for an import process.
     *
     * @param {String} modelName
     * @param {Object} [options={}]
     * @memberof CrudService
     */
    @action import(modelName, options = {}) {
        // always lowercase modelname
        modelName = modelName.toLowerCase();

        // set the model uri endpoint
        const modelEndpoint = dasherize(pluralize(modelName));
        const fetchOptions = options?.fetchOptions ?? {};
        const importEndpoint = options?.importEndpoint ?? options?.actionPath ?? `${modelEndpoint}/import`;

        // function to check if queue is empty
        const checkQueue = () => {
            const uploadQueue = this.modalsManager.getOption('uploadQueue');

            if (uploadQueue.length) {
                this.modalsManager.setOption('acceptButtonDisabled', false);
            } else {
                this.modalsManager.setOption('acceptButtonDisabled', true);
            }
        };

        this.modalsManager.show('modals/import-form', {
            title: `Import ${pluralize(smartHumanize(modelName))} with spreadsheets`,
            acceptButtonText: 'Start Import',
            acceptButtonScheme: 'magic',
            acceptButtonIcon: 'upload',
            acceptButtonDisabled: true,
            isProcessing: false,
            uploadQueue: [],
            fileQueueColumns: [
                { name: 'Type', valuePath: 'extension', key: 'type' },
                { name: 'File Name', valuePath: 'name', key: 'fileName' },
                { name: 'File Size', valuePath: 'size', key: 'fileSize' },
                { name: 'Upload Date', valuePath: 'file.lastModifiedDate', key: 'uploadDate' },
                { name: '', valuePath: '', key: 'delete' },
            ],
            acceptedFileTypes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
            queueFile: (file) => {
                const uploadQueue = this.modalsManager.getOption('uploadQueue');

                uploadQueue.pushObject(file);
                checkQueue();
            },

            removeFile: (file) => {
                const { queue } = file;
                const uploadQueue = this.modalsManager.getOption('uploadQueue');

                uploadQueue.removeObject(file);
                queue.remove(file);
                checkQueue();
            },
            confirm: async (modal) => {
                const uploadQueue = this.modalsManager.getOption('uploadQueue');
                const uploadedFiles = [];
                const uploadTask = (file) => {
                    return new Promise((resolve) => {
                        this.fetch.uploadFile.perform(
                            file,
                            {
                                path: `uploads/import-sources/${this.currentUser.companyId}/${modelEndpoint}`,
                                type: 'import-source',
                            },
                            (uploadedFile) => {
                                uploadedFiles.pushObject(uploadedFile);
                                resolve(uploadedFile);
                            }
                        );
                    });
                };

                if (!uploadQueue.length) {
                    return this.notifications.warning('No spreadsheets uploaded for import to process.');
                }

                modal.startLoading();
                modal.setOption('acceptButtonText', 'Uploading...');

                for (let i = 0; i < uploadQueue.length; i++) {
                    const file = uploadQueue.objectAt(i);
                    await uploadTask(file);
                }

                this.modalsManager.setOption('acceptButtonText', 'Processing...');
                this.modalsManager.setOption('isProcessing', true);

                const files = uploadedFiles.map((file) => file.id);

                try {
                    const response = await this.fetch.post(importEndpoint, { files }, fetchOptions);
                    if (typeof options.onImportCompleted === 'function') {
                        options.onImportCompleted(response, files);
                    }
                } catch (error) {
                    return this.notifications.serverError(error);
                }
            },
            ...options,
        });
    }
}

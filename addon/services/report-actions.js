import ResourceActionService from './resource-action';

export default class ReportActionsService extends ResourceActionService {
    constructor() {
        super(...arguments);
        this.initialize('report', { defaultAttributes: { query_config: {} } });
    }

    transition = {};

    panel = {
        create: (attributes = {}, options = {}) => {
            const report = this.createNewInstance(attributes);
            return this.resourceContextPanel.open({
                content: 'report/form',
                title: 'Create a new report',
                panelContentClass: 'px-4',
                saveOptions: {
                    callback: this.refresh,
                },
                report,
                ...options,
            });
        },
        edit: (report, options = {}) => {
            return this.resourceContextPanel.open({
                content: 'report/form',
                title: `Edit: ${report.name}`,
                panelContentClass: 'px-4',
                report,
                ...options,
            });
        },
        view: (report, options = {}) => {
            return this.resourceContextPanel.open({
                report,
                tabs: [
                    {
                        label: 'Overview',
                        component: 'report/details',
                        contentClass: 'p-4',
                    },
                ],
                ...options,
            });
        },
    };

    modal = {
        create: (attributes = {}, options = {}, saveOptions = {}) => {
            const report = this.createNewInstance(attributes);
            return this.modalsManager.show('modals/resource', {
                resource: report,
                title: 'Create a new report',
                acceptButtonText: 'Create report',
                component: 'report/form',
                confirm: (modal) => this.modalTask.perform(modal, 'saveTask', report, { refresh: true, ...saveOptions }),
                ...options,
            });
        },
        edit: (report, options = {}, saveOptions = {}) => {
            return this.modalsManager.show('modals/resource', {
                resource: report,
                title: `Edit: ${report.name}`,
                acceptButtonText: 'Save Changes',
                saveButtonIcon: 'save',
                component: 'report/form',
                confirm: (modal) => this.modalTask.perform(modal, 'saveTask', report, { refresh: true, ...saveOptions }),
                ...options,
            });
        },
        view: (report, options = {}) => {
            return this.modalsManager.show('modals/resource', {
                resource: report,
                title: report.name,
                component: 'report/details',
                ...options,
            });
        },
    };
}

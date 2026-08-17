import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * The import template URL the import modal offers for download, and the two
 * selection guards on bulkDelete and export.
 */
module('Unit | Service | resource-action (import template)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.crudCalls = [];
        this.opened = [];
        const testContext = this;

        this.owner.register(
            'service:crud',
            class extends Service {
                bulkDelete(...args) {
                    testContext.crudCalls.push({ method: 'bulkDelete', args });
                }
                export(...args) {
                    testContext.crudCalls.push({ method: 'export', args });
                }
                import(...args) {
                    testContext.crudCalls.push({ method: 'import', args });
                }
            }
        );

        this.owner.register(
            'service:table-context',
            class extends Service {
                getSelectedRows() {
                    return [];
                }
                getSelectedIds() {
                    return [];
                }
            }
        );

        this.owner.register(
            'service:intl',
            class extends Service {
                t(key) {
                    return key;
                }
            }
        );

        for (const name of ['modals-manager', 'notifications', 'router', 'abilities', 'fetch', 'current-user', 'resource-context-panel', 'universe', 'events']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:resource-action');
        this.service.initialize('widget');

        this.originalOpen = window.open;
        window.open = (url) => this.opened.push(url);

        this.templateUrl = () => {
            this.service.import();
            this.crudCalls.at(-1).args[1].onImportTemplate();
            return this.opened.at(-1);
        };
    });

    hooks.afterEach(function () {
        if (typeof this.originalOpen === 'function') {
            window.open = this.originalOpen;
        }
    });

    module('the template url', function () {
        test('it is built from the model name', function (assert) {
            assert.strictEqual(this.templateUrl(), 'https://flb-assets.s3.ap-southeast-1.amazonaws.com/import-templates/Fleetbase_Widget_Import_Template.xlsx');
        });

        test('a dasherized model name becomes underscored title case', function (assert) {
            this.service.initialize('fuel-report');

            assert.true(this.templateUrl().endsWith('/Fleetbase_Fuel_Report_Import_Template.xlsx'));
        });

        test('an underscored model name is treated the same way', function (assert) {
            this.service.initialize('service_rate');

            assert.true(this.templateUrl().endsWith('/Fleetbase_Service_Rate_Import_Template.xlsx'));
        });

        test('a shouty model name is normalised rather than passed through', function (assert) {
            this.service.initialize('ORDER');

            assert.true(this.templateUrl().endsWith('/Fleetbase_Order_Import_Template.xlsx'));
        });

        test('the asset host can be overridden', function (assert) {
            this.service.baseAssetUrl = 'https://assets.example.com';

            assert.true(this.templateUrl().startsWith('https://assets.example.com/import-templates/'));
        });

        test('the path can be overridden', function (assert) {
            this.service.importTemplatePath = 'templates/v2';

            assert.true(this.templateUrl().includes('/templates/v2/'));
        });

        test('the filename can be overridden outright', function (assert) {
            this.service.importTemplateName = 'my-template.xlsx';

            assert.true(this.templateUrl().endsWith('/my-template.xlsx'));
        });
    });

    module('an empty or missing selection', function () {
        test('bulkDelete dispatches an empty selection rather than short-circuiting', function (assert) {
            // The `if (!selected) return` that used to sit here could never fire
            // — a spread is always a truthy array — and has been removed. The
            // behaviour is unchanged: crud.bulkDelete does its own empty check.
            this.service.bulkDelete(null);

            assert.strictEqual(this.crudCalls[0].method, 'bulkDelete');
            assert.deepEqual(this.crudCalls[0].args[0], []);
        });

        test('export does the same, which is how "export everything" works', function (assert) {
            this.service.export(null);

            assert.strictEqual(this.crudCalls[0].method, 'export');
            assert.deepEqual(this.crudCalls[0].args[1].params.selections, []);
        });
    });
});

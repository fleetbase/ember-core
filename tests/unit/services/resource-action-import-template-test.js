import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { setOwner } from '@ember/application';
import ResourceActionService from '@fleetbase/ember-core/services/resource-action';

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

    module('options a subclass has cleared', function () {
        // bulkDeleteOptions, exportOptions, importOptions and fetchOptions are
        // all public tracked fields declared as `{}`. A consumer that clears one
        // is what the `?? {}` beside each of them is for.
        test('bulkDelete falls back to empty options and empty fetch options', function (assert) {
            this.service.bulkDeleteOptions = null;
            this.service.fetchOptions = null;

            this.service.bulkDelete();

            assert.deepEqual(this.crudCalls[0].args[0], [], 'no selection was passed and the table has none');
            assert.deepEqual(this.crudCalls[0].args[1].fetchOptions, {});
        });

        test('export does the same', function (assert) {
            this.service.exportOptions = null;
            this.service.fetchOptions = null;

            this.service.export();

            assert.deepEqual(this.crudCalls[0].args[1].params.selections, []);
            assert.deepEqual(this.crudCalls[0].args[1].fetchOptions, {});
        });

        test('import does too', function (assert) {
            this.service.importOptions = null;
            this.service.fetchOptions = null;

            this.service.import();

            assert.deepEqual(this.crudCalls[0].args[1].fetchOptions, {});
        });

        test('a cleared template path falls back to the declared one', function (assert) {
            this.service.importTemplatePath = null;

            assert.true(this.templateUrl().includes('/import-templates/'));
        });
    });

    module('the router it borrows', function () {
        // setupTest's owner always resolves `service:router` from Ember itself,
        // so the last link in the chain is only reachable with an owner that
        // resolves neither router service — an engine mid-boot, in practice.
        function routerFor(owner) {
            const context = {};
            setOwner(context, owner);
            return Object.getOwnPropertyDescriptor(ResourceActionService.prototype, 'router').get.call(context);
        }

        test('the host router wins when there is one', function (assert) {
            const hostRouter = { name: 'host-router' };

            assert.strictEqual(routerFor({ lookup: (name) => (name === 'service:host-router' ? hostRouter : undefined) }), hostRouter);
        });

        test('the plain router service is next', function (assert) {
            const router = { name: 'router' };

            assert.strictEqual(routerFor({ lookup: (name) => (name === 'service:router' ? router : undefined) }), router);
        });

        test('and the router microlib is the last resort', function (assert) {
            const main = { name: 'router:main' };

            assert.strictEqual(routerFor({ lookup: (name) => (name === 'router:main' ? main : undefined) }), main);
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * How the bulk methods assemble their options: the per-call argument, the
 * service-level defaults that override it, and the fetch options that are only
 * filled in when the caller has not supplied any.
 *
 * Also the router getter, which prefers an engine's host-router over the
 * application's own.
 */
module('Unit | Service | resource-action (option assembly)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.crudCalls = [];
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

        for (const name of ['modals-manager', 'notifications', 'abilities', 'fetch', 'current-user', 'resource-context-panel', 'universe', 'events']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:resource-action');
        this.service.initialize('widget');

        this.optionsOf = (method) => this.crudCalls.find((call) => call.method === method).args[1];
    });

    module('fetch options', function () {
        test('the service-level fetch options fill in when the caller gives none', function (assert) {
            this.service.fetchOptions = { headers: { 'X-A': '1' } };

            this.service.bulkDelete([]);

            assert.deepEqual(this.optionsOf('bulkDelete').fetchOptions, { headers: { 'X-A': '1' } });
        });

        test('caller-supplied fetch options are left alone', function (assert) {
            this.service.fetchOptions = { headers: { 'X-A': '1' } };

            this.service.bulkDelete([], { fetchOptions: { headers: { 'X-B': '2' } } });

            assert.deepEqual(this.optionsOf('bulkDelete').fetchOptions, { headers: { 'X-B': '2' } }, 'the global default does not overwrite them');
        });

        test('no fetch options anywhere leaves an empty object', function (assert) {
            this.service.bulkDelete([]);

            assert.deepEqual(this.optionsOf('bulkDelete').fetchOptions, {});
        });

        test('export follows the same three rules', function (assert) {
            this.service.export([], { fetchOptions: { headers: { 'X-B': '2' } } });
            assert.deepEqual(this.optionsOf('export').fetchOptions, { headers: { 'X-B': '2' } });

            this.crudCalls.length = 0;
            this.service.fetchOptions = { headers: { 'X-A': '1' } };
            this.service.export([]);
            assert.deepEqual(this.optionsOf('export').fetchOptions, { headers: { 'X-A': '1' } });
        });

        test('import follows them too', function (assert) {
            this.service.import({ fetchOptions: { headers: { 'X-B': '2' } } });
            assert.deepEqual(this.optionsOf('import').fetchOptions, { headers: { 'X-B': '2' } });

            this.crudCalls.length = 0;
            this.service.import();
            assert.deepEqual(this.optionsOf('import').fetchOptions, {});
        });
    });

    module('the service-level option bags', function () {
        test('bulkDeleteOptions override the call options', function (assert) {
            this.service.bulkDeleteOptions = { actionPath: 'widgets/bulk' };

            this.service.bulkDelete([], { actionPath: 'ignored' });

            assert.strictEqual(this.optionsOf('bulkDelete').actionPath, 'widgets/bulk', 'the service bag is spread last');
        });

        test('exportOptions do the same', function (assert) {
            this.service.exportOptions = { exportEndpoint: 'widgets/export' };

            this.service.export([], { exportEndpoint: 'ignored' });

            assert.strictEqual(this.optionsOf('export').exportEndpoint, 'widgets/export');
        });

        test('importOptions do the same', function (assert) {
            this.service.importOptions = { importEndpoint: 'widgets/import' };

            this.service.import({ importEndpoint: 'ignored' });

            assert.strictEqual(this.optionsOf('import').importEndpoint, 'widgets/import');
        });

        test('an unset bag leaves the call options untouched', function (assert) {
            this.service.import({ importEndpoint: 'mine' });

            assert.strictEqual(this.optionsOf('import').importEndpoint, 'mine');
        });
    });

    module('the router getter', function () {
        test('an engine host-router wins', function (assert) {
            this.owner.register('service:host-router', class extends Service {});

            assert.strictEqual(this.service.router, this.owner.lookup('service:host-router'));
        });

        test('the application router is the fallback', function (assert) {
            this.owner.register('service:router', class extends Service {});

            assert.strictEqual(this.service.router, this.owner.lookup('service:router'));
        });

        test('hostRouter aliases whichever one was chosen', function (assert) {
            this.owner.register('service:host-router', class extends Service {});

            assert.strictEqual(this.service.hostRouter, this.service.router);
        });
    });

    module('optional arguments left off', function () {
        test('update defaults its options', async function (assert) {
            const performed = [];
            this.service.updateTask.perform = (...args) => {
                performed.push(args);
                return Promise.resolve();
            };

            await this.service.update({ id: 'widget-1' });

            assert.deepEqual(performed[0][1], {});
        });

        test('search defaults its options', async function (assert) {
            const performed = [];
            this.service.searchTask.perform = (...args) => {
                performed.push(args);
                return Promise.resolve([]);
            };

            await this.service.search('widget');

            assert.deepEqual(performed[0][1], {});
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * `export` and `import` both open a modal and put all their behaviour in the
 * confirm callback, so the stubbed modals manager captures the options and the
 * tests drive that callback directly.
 */
module('Unit | Service | crud (export and import)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.shown = [];
        this.downloads = [];
        this.posts = [];
        this.notified = [];
        this.tracked = [];
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                show(template, options) {
                    this.options = options;
                    testContext.shown.push({ template, options });
                    return Promise.resolve();
                }
                setOption(key, value) {
                    this.options[key] = value;
                }
                getOption(key, fallback = null) {
                    return this.options?.[key] ?? fallback;
                }
            }
        );

        this.owner.register(
            'service:fetch',
            class extends Service {
                download(path, query, options) {
                    testContext.downloads.push({ path, query, options });
                    return testContext.downloadResult ?? Promise.resolve();
                }
                post(path, body, options) {
                    testContext.posts.push({ path, body, options });
                    return Promise.resolve(testContext.postResponse ?? {});
                }
                uploadFile = {
                    perform: (file, meta, onComplete) => onComplete({ id: `uploaded-${file.name}` }),
                };
            }
        );

        this.owner.register(
            'service:notifications',
            class extends Service {
                warning(message) {
                    testContext.notified.push({ level: 'warning', message });
                }
                serverError(error, message) {
                    testContext.notified.push({ level: 'error', error, message });
                }
            }
        );

        this.owner.register(
            'service:events',
            class extends Service {
                trackResourceExported(...args) {
                    testContext.tracked.push({ event: 'exported', args });
                }
                trackResourceImported(...args) {
                    testContext.tracked.push({ event: 'imported', args });
                }
            }
        );

        this.owner.register(
            'service:current-user',
            class extends Service {
                companyId = 'company-1';
            }
        );

        this.owner.register('service:store', class extends Service {});
        this.owner.register('service:universe', class extends Service {});

        this.service = this.owner.lookup('service:crud');
        this.modals = this.owner.lookup('service:modals-manager');
        this.options = () => this.shown.at(-1).options;
        this.modal = { startLoading: () => {}, stopLoading: () => {}, getOption: (k) => this.modals.getOption(k), setOption: (k, v) => this.modals.setOption(k, v) };
    });

    module('export', function () {
        test('it opens the export modal with the humanized plural title', function (assert) {
            this.service.export('fuel_report');

            assert.strictEqual(this.shown[0].template, 'modals/export-form');
            assert.strictEqual(this.options().title, 'Export Fuel Reports');
            assert.strictEqual(this.options().acceptButtonText, 'Download');
        });

        test('xlsx is the default format and the alternatives are offered', function (assert) {
            this.service.export('order');

            assert.strictEqual(this.options().format, 'xlsx');
            assert.deepEqual(this.options().formatOptions, ['csv', 'xlsx', 'xls', 'html', 'pdf']);
        });

        test('setFormat records the chosen format', function (assert) {
            this.service.export('order');

            this.options().setFormat({ target: { value: 'csv' } });

            assert.strictEqual(this.modals.getOption('format'), 'csv');
        });

        test('an empty format choice clears it', function (assert) {
            this.service.export('order');

            this.options().setFormat({ target: { value: '' } });

            assert.strictEqual(this.modals.getOption('format'), null);
        });

        test('confirming downloads from the derived endpoint', async function (assert) {
            this.service.export('fuel_report');

            await this.options().confirm(this.modal, () => {});

            assert.strictEqual(this.downloads[0].path, 'fuel-reports/export');
            assert.strictEqual(this.downloads[0].query.format, 'xlsx');
            assert.strictEqual(this.downloads[0].options.method, 'POST');
            assert.true(this.downloads[0].options.fileName.startsWith('fuel-reports-'), 'the filename carries the endpoint and a timestamp');
            assert.true(this.downloads[0].options.fileName.endsWith('.xlsx'));
        });

        test('an explicit export endpoint wins over the derived one', async function (assert) {
            this.service.export('order', { exportEndpoint: 'custom/export' });

            await this.options().confirm(this.modal, () => {});

            assert.strictEqual(this.downloads[0].path, 'custom/export');
        });

        test('actionPath is accepted as an alias', async function (assert) {
            this.service.export('order', { actionPath: 'via-action-path' });

            await this.options().confirm(this.modal, () => {});

            assert.strictEqual(this.downloads[0].path, 'via-action-path');
        });

        test('extra params and fetch options are merged in', async function (assert) {
            this.service.export('order', { params: { status: 'active' }, fetchOptions: { headers: { 'X-A': '1' } } });

            await this.options().confirm(this.modal, () => {});

            assert.strictEqual(this.downloads[0].query.status, 'active');
            assert.deepEqual(this.downloads[0].options.headers, { 'X-A': '1' });
        });

        test('the chosen format reaches the request and the filename', async function (assert) {
            this.service.export('order');
            this.options().setFormat({ target: { value: 'csv' } });

            await this.options().confirm(this.modal, () => {});

            assert.strictEqual(this.downloads[0].query.format, 'csv');
            assert.true(this.downloads[0].options.fileName.endsWith('.csv'));
        });

        test('a successful export is tracked', async function (assert) {
            this.service.export('order', { params: { status: 'active' } });

            await this.options().confirm(this.modal, () => {});

            assert.deepEqual(this.tracked, [{ event: 'exported', args: ['order', 'xlsx', { status: 'active' }] }]);
        });

        test('a failed export stops the modal and reports the error', async function (assert) {
            const boom = new Error('nope');
            this.downloadResult = Promise.reject(boom);
            let stopped = 0;
            this.service.export('order');

            await this.options().confirm({ ...this.modal, stopLoading: () => (stopped += 1) }, () => {});

            assert.strictEqual(stopped, 1);
            assert.strictEqual(this.notified[0].level, 'error');
            assert.strictEqual(this.notified[0].error, boom);
            assert.deepEqual(this.tracked, [], 'and nothing is tracked');
        });

        test('the model name is lowercased before use', function (assert) {
            this.service.export('FuelReport');

            assert.strictEqual(this.options().title, 'Export Fuelreports', 'lowercasing happens before humanizing');
        });

        test('caller options override the defaults', function (assert) {
            this.service.export('order', { title: 'Custom title' });

            assert.strictEqual(this.options().title, 'Custom title');
        });
    });

    module('import', function () {
        test('it opens the import modal, disabled until something is queued', function (assert) {
            this.service.import('fuel_report');

            assert.strictEqual(this.shown[0].template, 'modals/import-form');
            assert.strictEqual(this.options().title, 'Import Fuel Reports with spreadsheets');
            assert.true(this.options().acceptButtonDisabled);
            assert.deepEqual(this.options().uploadQueue, []);
        });

        test('it accepts the three spreadsheet mime types', function (assert) {
            this.service.import('order');

            assert.deepEqual(this.options().acceptedFileTypes, ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']);
        });

        test('queueing a file throws, because the queue is a plain array', function (assert) {
            // Pinned, not fixed. `uploadQueue` is initialized to `[]` — a plain
            // array literal — and queueFile calls `pushObject` on it, which
            // does not exist with prototype extensions off. removeFile and the
            // confirm loop have the same problem with removeObject and objectAt.
            // The import modal cannot accept a file at all.
            this.service.import('order');

            assert.throws(() => this.options().queueFile({ name: 'orders.csv' }), /pushObject is not a function/);
        });

        test('a caller supplying an Ember array can queue files', function (assert) {
            const uploadQueue = [];
            uploadQueue.pushObject = (file) => uploadQueue.push(file);
            this.service.import('order', { uploadQueue });

            this.options().queueFile({ name: 'orders.csv' });

            assert.strictEqual(uploadQueue.length, 1);
            assert.false(this.modals.getOption('acceptButtonDisabled'), 'and the accept button unlocks');
        });

        test('confirming with an empty queue warns instead of uploading', async function (assert) {
            this.service.import('order');

            await this.options().confirm(this.modal);

            assert.deepEqual(this.notified, [{ level: 'warning', message: 'No spreadsheets uploaded for import to process.' }]);
            assert.deepEqual(this.posts, []);
        });

        test('confirming uploads each file then posts their ids', async function (assert) {
            const uploadQueue = [{ name: 'a.csv' }, { name: 'b.csv' }];
            uploadQueue.objectAt = (index) => uploadQueue[index];
            this.service.import('fuel_report', { uploadQueue });

            await this.options().confirm(this.modal);

            assert.strictEqual(this.posts[0].path, 'fuel-reports/import');
            assert.deepEqual(this.posts[0].body, { files: ['uploaded-a.csv', 'uploaded-b.csv'] });
        });

        test('an explicit import endpoint wins', async function (assert) {
            const uploadQueue = [{ name: 'a.csv' }];
            uploadQueue.objectAt = (index) => uploadQueue[index];
            this.service.import('order', { uploadQueue, importEndpoint: 'custom/import' });

            await this.options().confirm(this.modal);

            assert.strictEqual(this.posts[0].path, 'custom/import');
        });

        test('the import is tracked with a count from the response', async function (assert) {
            const uploadQueue = [{ name: 'a.csv' }];
            uploadQueue.objectAt = (index) => uploadQueue[index];
            this.postResponse = { imported: [1, 2, 3] };
            this.service.import('order', { uploadQueue });

            await this.options().confirm(this.modal);

            assert.deepEqual(this.tracked, [{ event: 'imported', args: ['order', 3] }]);
        });

        test('the count falls back to the response count, then to the file count', async function (assert) {
            const uploadQueue = [{ name: 'a.csv' }];
            uploadQueue.objectAt = (index) => uploadQueue[index];

            this.postResponse = { count: 7 };
            this.service.import('order', { uploadQueue });
            await this.options().confirm(this.modal);
            assert.deepEqual(this.tracked.at(-1).args, ['order', 7]);

            this.postResponse = {};
            this.service.import('order', { uploadQueue });
            await this.options().confirm(this.modal);
            assert.deepEqual(this.tracked.at(-1).args, ['order', 1], 'one file was uploaded');
        });

        test('an onImportCompleted callback receives the response and file ids', async function (assert) {
            const seen = [];
            const uploadQueue = [{ name: 'a.csv' }];
            uploadQueue.objectAt = (index) => uploadQueue[index];
            this.postResponse = { imported: [1] };
            this.service.import('order', { uploadQueue, onImportCompleted: (response, files) => seen.push({ response, files }) });

            await this.options().confirm(this.modal);

            assert.deepEqual(seen, [{ response: { imported: [1] }, files: ['uploaded-a.csv'] }]);
        });

        test('a failed import reports the error and skips the callback', async function (assert) {
            const uploadQueue = [{ name: 'a.csv' }];
            uploadQueue.objectAt = (index) => uploadQueue[index];
            const boom = new Error('nope');
            this.owner.lookup('service:fetch').post = () => Promise.reject(boom);
            const seen = [];
            this.service.import('order', { uploadQueue, onImportCompleted: () => seen.push('called') });

            await this.options().confirm(this.modal);

            assert.strictEqual(this.notified[0].error, boom);
            assert.deepEqual(seen, []);
        });
    });
});

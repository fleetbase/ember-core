import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * `uploadFile` and `download`.
 *
 * uploadFile needs no seam at all — the file is an argument, and everything it
 * touches (`upload`, `state`, `queue`) is on that object.
 *
 * download goes through the same ember-fetch module export the base-request
 * tests intercept, and then hands the blob to the vendored downloadjs helper.
 */
module('Unit | Service | fetch (upload and download)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.fetchModule = window.require('fetch');
        this.originalModuleFetch = this.fetchModule.fetch;

        this.requests = [];
        this.responseHeaders = { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="orders.csv"' };
        this.fetchModule.fetch = (url, options) => {
            this.requests.push({ url, options });
            return Promise.resolve({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: { get: (key) => this.responseHeaders[String(key).toLowerCase()] ?? null },
                blob: () => Promise.resolve(new Blob(['a,b\n1,2'], { type: 'text/csv' })),
                json: () => Promise.resolve({}),
                clone() {
                    return this;
                },
            });
        };

        const testContext = this;
        this.sessionData = { authenticated: {} };
        this.isAuthenticated = false;
        this.owner.register(
            'service:session',
            class extends Service {
                get data() {
                    return testContext.sessionData;
                }
                get isAuthenticated() {
                    return testContext.isAuthenticated;
                }
            }
        );

        this.serverErrors = [];
        this.owner.register(
            'service:notifications',
            class extends Service {
                serverError(error, message) {
                    testContext.serverErrors.push({ error, message });
                }
            }
        );

        this.service = this.owner.lookup('service:fetch');
        this.lastRequest = () => this.requests.at(-1);

        // A stand-in for an ember-file-upload File.
        this.uploadResult = { file: { uuid: 'file-1', original_filename: 'a.csv' } };
        this.uploadRejects = false;
        this.file = (state = 'queued') => {
            const removed = [];
            return {
                state,
                size: 42,
                removedFrom: removed,
                uploads: [],
                queue: { remove: (f) => removed.push(f) },
                upload: (url, options) => {
                    this.uploadedTo = { url, options };
                    return this.uploadRejects
                        ? Promise.reject(new Error('upload failed'))
                        : Promise.resolve({
                              json: () => Promise.resolve(this.uploadResult),
                          });
                },
            };
        };
    });

    hooks.afterEach(function () {
        if (typeof this.originalModuleFetch === 'function') {
            this.fetchModule.fetch = this.originalModuleFetch;
        }
    });

    module('uploadFile', function () {
        test('a queued file is uploaded to the files endpoint', async function (assert) {
            const file = this.file();

            await this.service.uploadFile.perform(file);

            assert.true(this.uploadedTo.url.endsWith('/files/upload'));
            assert.strictEqual(this.uploadedTo.options.data.file_size, 42);
            assert.true(this.uploadedTo.options.withCredentials);
        });

        test('the content type header is removed for a multipart upload', async function (assert) {
            await this.service.uploadFile.perform(this.file());

            assert.strictEqual(this.uploadedTo.options.headers['Content-Type'], undefined);
        });

        test('extra params are sent alongside the file size', async function (assert) {
            await this.service.uploadFile.perform(this.file(), { path: 'uploads/imports', type: 'import-source' });

            assert.strictEqual(this.uploadedTo.options.data.path, 'uploads/imports');
            assert.strictEqual(this.uploadedTo.options.data.type, 'import-source');
        });

        test('a file in a state it cannot be uploaded from is skipped', async function (assert) {
            const file = this.file('uploaded');

            const result = await this.service.uploadFile.perform(file);

            assert.strictEqual(result, undefined);
            assert.strictEqual(this.uploadedTo, undefined, 'nothing was sent');
        });

        test('every retryable state is accepted', async function (assert) {
            for (const state of ['queued', 'failed', 'timed_out', 'aborted']) {
                this.uploadedTo = undefined;
                await this.service.uploadFile.perform(this.file(state));
                assert.ok(this.uploadedTo, `${state} uploads`);
            }
        });

        test('a failed upload reports the error and calls back', async function (assert) {
            this.uploadRejects = true;
            const errors = [];

            const result = await this.service.uploadFile.perform(this.file(), {}, undefined, (error) => errors.push(error));

            assert.strictEqual(result, null, 'no model is produced');
            assert.strictEqual(this.serverErrors[0].message, 'File upload failed.');
            assert.strictEqual(errors[0].message, 'upload failed');
        });

        test('a non-function error callback is ignored', async function (assert) {
            this.uploadRejects = true;

            assert.strictEqual(await this.service.uploadFile.perform(this.file(), {}, undefined, 'not a function'), null);
        });
    });

    module('download', function () {
        test('it requests the derived url and resolves', async function (assert) {
            await this.service.download('orders/export');

            assert.strictEqual(this.lastRequest().url, `${this.service.host}/${this.service.namespace}/orders/export`);
        });

        test('a GET puts the query in the url and sends no body', async function (assert) {
            await this.service.download('orders/export', { format: 'csv' });

            assert.true(this.lastRequest().url.endsWith('?format=csv'));
            assert.strictEqual(this.lastRequest().options.body, undefined);
        });

        test('a POST puts the query in the body and leaves the url clean', async function (assert) {
            await this.service.download('orders/export', { format: 'csv' }, { method: 'POST' });

            assert.false(this.lastRequest().url.includes('?'));
            assert.strictEqual(this.lastRequest().options.body, '{"format":"csv"}');
        });

        test('an external request skips the host and namespace', async function (assert) {
            await this.service.download('https://example.com/report.csv', {}, { externalRequest: true });

            assert.strictEqual(this.lastRequest().url, 'https://example.com/report.csv');
        });

        test('the filename comes from the content-disposition header', async function (assert) {
            const options = {};

            await this.service.download('orders/export', {}, options);

            assert.strictEqual(options.fileName, 'orders.csv');
        });

        test('a caller-supplied filename wins', async function (assert) {
            const options = { fileName: 'mine.csv' };

            await this.service.download('orders/export', {}, options);

            assert.strictEqual(options.fileName, 'mine.csv');
        });

        test('the mime type comes from the response', async function (assert) {
            const options = {};

            await this.service.download('orders/export', {}, options);

            assert.strictEqual(options.mimeType, 'text/csv');
        });

        test('a response with no content type falls back to the filename extension', async function (assert) {
            this.responseHeaders = { 'content-disposition': 'attachment; filename="orders.xlsx"' };
            const options = {};

            await this.service.download('orders/export', {}, options);

            assert.ok(options.mimeType, 'something was derived from the name');
        });

        test('a failed request rejects', async function (assert) {
            this.fetchModule.fetch = () => Promise.reject(new Error('network down'));

            await assert.rejects(this.service.download('orders/export'), /network down/);
        });
    });
});

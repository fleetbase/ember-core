import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * Two paths the sibling fetch files reach past rather than into: `request`'s
 * normalizeToEmberData branch, and the half of `uploadFile` that turns the
 * server's response into a store record.
 *
 * The upload tests before this one stubbed the upload but registered no `file`
 * model, so `store.normalize('file', …)` threw and the outer catch swallowed it
 * — the assertions still passed because they only checked what was SENT. A real
 * model is registered here so the success half actually runs.
 */
class FileModel extends Model {
    @attr('string') original_filename;
}

module('Unit | Service | fetch (normalize and upload result)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.fetchModule = window.require('fetch');
        this.originalModuleFetch = this.fetchModule.fetch;

        this.response = { ok: true, status: 200, statusText: 'OK', json: {} };
        this.fetchModule.fetch = () =>
            Promise.resolve({
                ok: this.response.ok,
                status: this.response.status,
                statusText: this.response.statusText,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve(this.response.json),
                text: () => Promise.resolve(JSON.stringify(this.response.json)),
                clone() {
                    return this;
                },
                blob: () => Promise.resolve(new Blob([])),
            });

        const testContext = this;
        this.owner.register(
            'service:session',
            class extends Service {
                get data() {
                    return { authenticated: {} };
                }
                get isAuthenticated() {
                    return false;
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

        this.owner.register('model:file', FileModel);
        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:fetch');

        this.uploadResult = { file: { uuid: 'file-1', original_filename: 'orders.csv' } };
        this.uploadRejects = false;
        this.file = () => ({
            state: 'queued',
            size: 42,
            queue: { remove: () => {} },
            upload: () =>
                this.uploadRejects
                    ? Promise.reject(new Error('upload failed'))
                    : Promise.resolve({
                          json: () => Promise.resolve(this.uploadResult),
                      }),
        });
    });

    hooks.afterEach(function () {
        if (typeof this.originalModuleFetch === 'function') {
            this.fetchModule.fetch = this.originalModuleFetch;
        }
    });

    module('normalizeToEmberData', function () {
        test('the payload is pushed into the store and the record resolved', async function (assert) {
            this.response.json = { file: { uuid: 'file-1', original_filename: 'orders.csv' } };

            const record = await this.service.request('files/1', 'GET', {}, { normalizeToEmberData: true, normalizeModelType: 'file' });

            assert.strictEqual(record.id, 'file-1', 'the serializer primary key is uuid');
            assert.strictEqual(record.original_filename, 'orders.csv');
        });

        test('onSuccess receives the record rather than the raw payload', async function (assert) {
            this.response.json = { file: { uuid: 'file-1', original_filename: 'orders.csv' } };
            const seen = [];

            await this.service.request('files/1', 'GET', {}, { normalizeToEmberData: true, normalizeModelType: 'file', onSuccess: (record) => seen.push(record) });

            assert.strictEqual(seen[0].original_filename, 'orders.csv');
        });

        test('a non-function onSuccess is ignored on this path too', async function (assert) {
            this.response.json = { file: { uuid: 'file-1' } };

            const record = await this.service.request('files/1', 'GET', {}, { normalizeToEmberData: true, normalizeModelType: 'file', onSuccess: 'not a function' });

            assert.strictEqual(record.id, 'file-1');
        });
    });

    module('the uploaded file becomes a record', function () {
        test('the response is normalized and pushed', async function (assert) {
            const model = await this.service.uploadFile.perform(this.file());

            assert.strictEqual(model.id, 'file-1');
            assert.strictEqual(model.original_filename, 'orders.csv');
        });

        test('the record is set back onto the file', async function (assert) {
            const file = this.file();

            const model = await this.service.uploadFile.perform(file);

            assert.strictEqual(file.model, model, 'so the uploader can show what it produced');
        });

        test('a callback receives the record', async function (assert) {
            const seen = [];

            const model = await this.service.uploadFile.perform(this.file(), {}, (record) => seen.push(record));

            assert.deepEqual(seen, [model]);
        });

        test('a non-function callback is ignored', async function (assert) {
            const model = await this.service.uploadFile.perform(this.file(), {}, 'not a function');

            assert.strictEqual(model.id, 'file-1');
        });

        test('a response with no file yields null', async function (assert) {
            this.uploadResult = undefined;

            assert.strictEqual(await this.service.uploadFile.perform(this.file()), null);
        });

        test('a file that cannot be normalized is removed from the queue and reported', async function (assert) {
            const removed = [];
            const file = this.file();
            file.queue = { remove: (f) => removed.push(f) };
            this.uploadResult = { file: { no_uuid: true } };

            await this.service.uploadFile.perform(file);

            assert.deepEqual(removed, [file], 'the outer catch cleans the queue up');
            assert.strictEqual(this.serverErrors.at(-1).message, 'File upload failed.');
        });
    });
});

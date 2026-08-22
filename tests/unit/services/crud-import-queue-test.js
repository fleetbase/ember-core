import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { A } from '@ember/array';

/**
 * The import modal's file queue: queueing, removing, and the accept button that
 * follows the queue's emptiness.
 *
 * The default uploadQueue crud supplies is a plain `[]`, and all three of
 * queueFile, removeFile and confirm call Ember array methods on it — which do
 * not exist with prototype extensions off. That is already on the defect
 * register; the tests here pin both the failure and the caller-supplied
 * `A([])` that works around it.
 */
module('Unit | Service | crud (import queue)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.shown = [];
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                show(template, options) {
                    testContext.shown.push({ template, options });
                    this.options = options;
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

        for (const name of ['fetch', 'notifications', 'store', 'current-user', 'events', 'universe']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:crud');
        this.modals = this.owner.lookup('service:modals-manager');
        this.lastOptions = () => this.shown.at(-1).options;

        this.file = (name) => {
            const removed = [];
            return { name, extension: 'csv', size: 10, removedFrom: removed, queue: { remove: (f) => removed.push(f) } };
        };
    });

    module('with the default queue', function () {
        test('queueing throws, because the queue is a plain array', function (assert) {
            this.service.import('order');

            assert.throws(() => this.lastOptions().queueFile(this.file('a.csv')), /pushObject is not a function/);
        });

        test('removing throws for the same reason', function (assert) {
            this.service.import('order');

            assert.throws(() => this.lastOptions().removeFile(this.file('a.csv')), /removeObject is not a function/);
        });
    });

    module('with a queue the caller supplies', function (hooks) {
        hooks.beforeEach(function () {
            this.uploadQueue = A([]);
            this.service.import('order', { uploadQueue: this.uploadQueue });
        });

        test('the accept button starts disabled', function (assert) {
            assert.true(this.lastOptions().acceptButtonDisabled);
        });

        test('queueing a file enables the accept button', function (assert) {
            this.lastOptions().queueFile(this.file('a.csv'));

            assert.deepEqual(
                this.uploadQueue.map((file) => file.name),
                ['a.csv']
            );
            assert.false(this.modals.getOption('acceptButtonDisabled'));
        });

        test('removing the last file disables it again', function (assert) {
            const file = this.file('a.csv');
            this.lastOptions().queueFile(file);

            this.lastOptions().removeFile(file);

            assert.deepEqual(this.uploadQueue.toArray(), []);
            assert.true(this.modals.getOption('acceptButtonDisabled'));
        });

        test('removing one of several leaves the button enabled', function (assert) {
            const [first, second] = [this.file('a.csv'), this.file('b.csv')];
            this.lastOptions().queueFile(first);
            this.lastOptions().queueFile(second);

            this.lastOptions().removeFile(first);

            assert.deepEqual(
                this.uploadQueue.map((file) => file.name),
                ['b.csv']
            );
            assert.false(this.modals.getOption('acceptButtonDisabled'));
        });

        test('removing a file also drops it from the uploader own queue', function (assert) {
            const file = this.file('a.csv');
            this.lastOptions().queueFile(file);

            this.lastOptions().removeFile(file);

            assert.deepEqual(file.removedFrom, [file], 'so the file-upload component stops showing it');
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * The two ember-concurrency tasks on the chat service, driven through the real
 * task rather than a stubbed `perform`. Both are thin store queries, so the
 * store is the only seam needed.
 */
module('Unit | Service | chat (tasks)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.queries = [];
        this.result = [{ id: 'm-1' }, { id: 'm-2' }];
        this.queryRejects = false;
        const testContext = this;

        this.owner.register(
            'service:store',
            class extends Service {
                query(modelName, params) {
                    testContext.queries.push({ modelName, params });
                    if (testContext.queryRejects) {
                        return Promise.reject(new Error('query failed'));
                    }
                    return Promise.resolve(testContext.result);
                }
            }
        );

        for (const name of ['current-user', 'app-cache', 'fetch', 'socket']) {
            this.owner.register(`service:${name}`, class extends Service {});
        }

        this.service = this.owner.lookup('service:chat');
        this.service.trigger = () => {};
    });

    module('loadMessages', function () {
        test('it queries the messages for the channel and returns them', async function (assert) {
            const channelRecord = { id: 'channel-1', set: () => {} };

            const messages = await this.service.loadMessages.perform(channelRecord);

            assert.strictEqual(messages, this.result);
            assert.deepEqual(this.queries, [{ modelName: 'chat-message', params: { chat_channel_uuid: 'channel-1' } }]);
        });

        test('it assigns the messages onto the channel record', async function (assert) {
            const assigned = [];
            const channelRecord = { id: 'channel-1', set: (key, value) => assigned.push({ key, value }) };

            await this.service.loadMessages.perform(channelRecord);

            assert.deepEqual(assigned, [{ key: 'messages', value: this.result }]);
        });

        test('a failed query rejects rather than resolving empty', async function (assert) {
            this.queryRejects = true;

            await assert.rejects(this.service.loadMessages.perform({ id: 'channel-1', set: () => {} }), /query failed/);
        });
    });

    module('loadChannels', function () {
        test('it queries channels and stores them on the service', async function (assert) {
            const channels = await this.service.loadChannels.perform();

            assert.strictEqual(channels, this.result);
            assert.strictEqual(this.service.channels, this.result);
        });

        test('it queries with no params by default', async function (assert) {
            await this.service.loadChannels.perform();

            assert.deepEqual(this.queries, [{ modelName: 'chat-channel', params: {} }]);
        });

        test('params are passed through', async function (assert) {
            await this.service.loadChannels.perform({ params: { limit: 5 } });

            assert.deepEqual(this.queries[0].params, { limit: 5 });
        });

        test('a non-array result is not stored', async function (assert) {
            this.result = { notAnArray: true };

            const channels = await this.service.loadChannels.perform();

            assert.deepEqual(this.service.channels, [], 'the tracked list is left as it was');
            assert.strictEqual(channels, this.result, 'but it is still returned to the caller');
        });

        test('a withChannels callback receives the result', async function (assert) {
            const seen = [];

            await this.service.loadChannels.perform({ withChannels: (channels) => seen.push(channels) });

            assert.deepEqual(seen, [this.result]);
        });

        test('a non-function withChannels is ignored', async function (assert) {
            const channels = await this.service.loadChannels.perform({ withChannels: 'not a function' });

            assert.strictEqual(channels, this.result);
        });
    });
});

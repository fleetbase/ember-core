import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * The remembering half of the chat service, driven directly rather than through
 * openChannel/closeChannel: what happens when the cached 'open-chats' entry is
 * not the list the code expects, and the empty-channel creation path.
 *
 * The sibling test covers the happy paths through openChannel and closeChannel;
 * these are the branches those two never reach.
 */
function channel(id) {
    return { id, name: `Channel ${id}` };
}

module('Unit | Service | chat (recall and creation)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.cache = {};
        this.found = {};
        this.findFailures = {};
        this.created = [];
        const testContext = this;

        this.owner.register(
            'service:app-cache',
            class extends Service {
                get(key, fallback = null) {
                    return testContext.cache[key] !== undefined ? testContext.cache[key] : fallback;
                }
                set(key, value) {
                    testContext.cache[key] = value;
                }
            }
        );

        this.owner.register(
            'service:store',
            class extends Service {
                findRecord(modelName, id) {
                    if (testContext.findFailures[id]) {
                        return Promise.reject(new Error(`no ${modelName} ${id}`));
                    }
                    return Promise.resolve(testContext.found[id] ?? channel(id));
                }
                createRecord(modelName, attributes) {
                    const record = {
                        modelName,
                        ...attributes,
                        id: `${modelName}-1`,
                        save() {
                            testContext.created.push(record);
                            return testContext.saveRejects ? Promise.reject(new Error('save failed')) : Promise.resolve(record);
                        },
                    };
                    return record;
                }
            }
        );

        this.owner.register('service:current-user', class extends Service {});
        this.owner.register('service:fetch', class extends Service {});
        this.owner.register('service:socket', class extends Service {});

        this.service = this.owner.lookup('service:chat');
        this.events = [];
        this.service.trigger = (name, record) => this.events.push({ name, id: record?.id });
    });

    module('rememberOpenedChannel', function () {
        test('it appends to the remembered list', function (assert) {
            this.cache['open-chats'] = ['a'];

            this.service.rememberOpenedChannel(channel('b'));

            assert.deepEqual(this.cache['open-chats'], ['a', 'b']);
        });

        test('remembering an already-remembered channel DISCARDS the rest of the list', function (assert) {
            // Pinned, not fixed. The condition is
            //   if (isArray(openedChats) && !openedChats.includes(id)) { append }
            //   else { openedChats = [id] }
            // so the else arm is reached in two quite different situations: the
            // cache holding something that is not a list, and the id already
            // being present. In the second the whole list is replaced by the one
            // id, silently forgetting every other open chat.
            this.cache['open-chats'] = ['a', 'b', 'c'];

            this.service.rememberOpenedChannel(channel('b'));

            assert.deepEqual(this.cache['open-chats'], ['b'], 'a and c are gone');
        });

        test('a cache holding something that is not a list is replaced', function (assert) {
            this.cache['open-chats'] = 'corrupted';

            this.service.rememberOpenedChannel(channel('a'));

            assert.deepEqual(this.cache['open-chats'], ['a']);
        });

        test('openChannel does not trip the discarding branch, because it returns early', function (assert) {
            // Which is why the defect above is latent rather than live: the only
            // in-addon caller guards against the repeat.
            const a = channel('a');
            this.service.openChannel(a);
            this.service.openChannel(a);

            assert.deepEqual(this.cache['open-chats'], ['a']);
        });
    });

    module('forgetOpenedChannel', function () {
        test('it drops just that channel', function (assert) {
            this.cache['open-chats'] = ['a', 'b'];

            this.service.forgetOpenedChannel(channel('a'));

            assert.deepEqual(this.cache['open-chats'], ['b']);
        });

        test('forgetting an unremembered channel leaves the list alone', function (assert) {
            this.cache['open-chats'] = ['a'];

            this.service.forgetOpenedChannel(channel('z'));

            assert.deepEqual(this.cache['open-chats'], ['a']);
        });

        test('a cache holding something that is not a list is emptied', function (assert) {
            this.cache['open-chats'] = 'corrupted';

            this.service.forgetOpenedChannel(channel('a'));

            assert.deepEqual(this.cache['open-chats'], []);
        });
    });

    module('restoreOpenedChats', function () {
        test('it loads every remembered channel and opens it', async function (assert) {
            this.cache['open-chats'] = ['a', 'b'];

            const restored = await this.service.restoreOpenedChats();

            assert.deepEqual(
                restored.map((record) => record.id),
                ['a', 'b']
            );
            assert.deepEqual(
                this.service.openChannels.map((record) => record.id),
                ['a', 'b']
            );
        });

        test('it announces each restored channel', async function (assert) {
            this.cache['open-chats'] = ['a'];

            await this.service.restoreOpenedChats();

            assert.deepEqual(this.events, [{ name: 'chat.opened', id: 'a' }]);
        });

        test('nothing remembered restores nothing', async function (assert) {
            const restored = await this.service.restoreOpenedChats();

            assert.deepEqual(restored, []);
            assert.deepEqual(this.service.openChannels, []);
        });

        test('a cache holding something that is not a list returns an empty array', function (assert) {
            this.cache['open-chats'] = 'corrupted';

            assert.deepEqual(this.service.restoreOpenedChats(), [], 'and it is not a promise');
        });

        test('one channel that cannot be loaded rejects the whole restore', async function (assert) {
            this.cache['open-chats'] = ['a', 'gone'];
            this.findFailures.gone = true;

            await assert.rejects(this.service.restoreOpenedChats(), /no chat-channel gone/);

            assert.deepEqual(this.service.openChannels, [], 'so none of them are opened');
        });
    });

    module('createEmptyChatChannel', function () {
        test('it creates and saves a channel with just a name', async function (assert) {
            const record = await this.service.createEmptyChatChannel('Dispatch');

            assert.strictEqual(record.modelName, 'chat-channel');
            assert.strictEqual(record.name, 'Dispatch');
            assert.strictEqual(this.created.length, 1);
        });

        test('it announces the creation', async function (assert) {
            await this.service.createEmptyChatChannel('Dispatch');

            assert.deepEqual(this.events, [{ name: 'chat.created', id: 'chat-channel-1' }]);
        });

        test('a failed save still announces, because the trigger is in a finally', async function (assert) {
            this.saveRejects = true;

            await assert.rejects(this.service.createEmptyChatChannel('Dispatch'), /save failed/);

            assert.deepEqual(this.events, [{ name: 'chat.created', id: 'chat-channel-1' }]);
        });
    });
});

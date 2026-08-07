import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import Model, { attr } from '@ember-data/model';

/**
 * ChatService owns channel lifecycle, message sending, and the four
 * socket-driven feed inserts.
 *
 * The chat-channel model itself lives in a sibling package, so channels are
 * hand-built fixtures exposing the surface this service actually uses — `feed`
 * with pushObject, and the two existence predicates. The message, log,
 * attachment and receipt models are registered locally so `store.normalize` and
 * `store.push` run for real; note the shipped serializer keys on `uuid`.
 */
class ChatMessageModel extends Model {
    @attr('string') content;
    @attr('string') created_at;
}

class ChatLogModel extends Model {
    @attr('string') event;
    @attr('string') created_at;
}

class ChatAttachmentModel extends Model {
    @attr('string') filename;
    @attr('string') chat_message_uuid;
    @attr('string') created_at;
}

class ChatReceiptModel extends Model {
    @attr('string') chat_message_uuid;
    @attr('string') created_at;
}

function channel(id = 'channel-1') {
    const feed = [];
    feed.pushObject = (item) => feed.push(item);

    return {
        id,
        feed,
        present: new Set(),
        existsInFeed(type, record) {
            return this.present.has(`${type}:${record.id}`);
        },
        doesntExistsInFeed(type, record) {
            return !this.existsInFeed(type, record);
        },
    };
}

module('Unit | Service | chat', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.cache = {};
        this.posts = [];
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
            'service:fetch',
            class extends Service {
                post(path, body, options) {
                    testContext.posts.push({ path, body, options });
                    return Promise.resolve(testContext.postResponse);
                }
            }
        );

        this.owner.register('service:current-user', class extends Service {});
        this.owner.register('model:chat-message', ChatMessageModel);
        this.owner.register('model:chat-log', ChatLogModel);
        this.owner.register('model:chat-attachment', ChatAttachmentModel);
        this.owner.register('model:chat-receipt', ChatReceiptModel);

        this.store = this.owner.lookup('service:store');
        this.service = this.owner.lookup('service:chat');

        this.events = [];
        this.service.trigger = (name, ...args) => this.events.push({ name, args });

        this.saved = [];
        const createRecord = this.store.createRecord.bind(this.store);
        this.store.createRecord = (...args) => {
            const record = createRecord(...args);
            record.save = () => {
                this.saved.push(record);
                return Promise.resolve(record);
            };
            record.destroyRecord = () => {
                record.destroyed = true;
                return Promise.resolve(record);
            };
            return record;
        };

        this.eventNames = () => this.events.map((e) => e.name);

        // Attachments and receipts hang off an existing message in the feed,
        // matched on chat_message_uuid — they never become feed items.
        this.messageInFeed = (chatChannel, id) => {
            const attachments = [];
            attachments.pushObject = (item) => attachments.push(item);
            const receipts = [];
            receipts.pushObject = (item) => receipts.push(item);
            const record = { id, attachments, receipts };
            chatChannel.feed.pushObject({ type: 'message', record });
            return record;
        };
    });

    module('restoring open chats', function () {
        test('nothing cached means nothing to restore', async function (assert) {
            this.store.findRecord = () => Promise.reject(new Error('should not be called'));

            assert.deepEqual(await this.service.restoreOpenedChats(), []);
        });

        test('each cached id is looked up and opened', async function (assert) {
            this.cache['open-chats'] = ['a', 'b'];
            const records = { a: channel('a'), b: channel('b') };
            this.store.findRecord = (_type, id) => Promise.resolve(records[id]);

            const restored = await this.service.restoreOpenedChats();

            assert.deepEqual(
                restored.map((r) => r.id),
                ['a', 'b']
            );
            assert.deepEqual(
                this.service.openChannels.map((c) => c.id),
                ['a', 'b']
            );
        });

        test('a non-array cache entry restores nothing', async function (assert) {
            this.cache['open-chats'] = 'corrupted';

            assert.deepEqual(await this.service.restoreOpenedChats(), []);
        });

        test('getOpenChannels reports the open list', function (assert) {
            const a = channel('a');
            this.service.openChannel(a);

            assert.deepEqual(this.service.getOpenChannels(), [a]);
        });
    });

    module('channel lifecycle', function () {
        test('creating a channel posts and announces it', async function (assert) {
            this.postResponse = channel('new');

            const created = await this.service.createChatChannel('Support', ['user-1']);

            assert.deepEqual(this.posts[0].path, 'chat-channels');
            assert.deepEqual(this.posts[0].body, { chatChannel: { name: 'Support', participants: ['user-1'] } });
            assert.true(this.posts[0].options.normalizeToEmberData);
            assert.strictEqual(this.posts[0].options.normalizeModelType, 'chat_channel');
            assert.strictEqual(created.id, 'new');
            assert.deepEqual(this.eventNames(), ['chat.created']);
        });

        test('participants default to none', async function (assert) {
            this.postResponse = channel('new');

            await this.service.createChatChannel('Support');

            assert.deepEqual(this.posts[0].body.chatChannel.participants, []);
        });

        test('deleting a channel destroys the record and announces it', async function (assert) {
            const record = this.store.createRecord('chat-message', {});

            await this.service.deleteChatChannel(record);

            assert.true(record.destroyed);
            assert.deepEqual(this.eventNames(), ['chat.deleted']);
        });

        test('updating a channel applies the properties and saves', async function (assert) {
            const record = this.store.createRecord('chat-message', {});

            await this.service.updateChatChannel(record, { content: 'Renamed' });

            assert.strictEqual(record.content, 'Renamed');
            assert.deepEqual(this.saved, [record]);
            assert.deepEqual(this.eventNames(), ['chat.updated']);
        });
    });

    module('participants', function () {
        test('adding one saves a participant tied to the channel and user', async function (assert) {
            this.owner.register('model:chat-participant', class extends Model {});
            const chatChannel = channel('channel-1');

            await this.service.addParticipant(chatChannel, { id: 'user-1' });

            assert.strictEqual(this.saved.length, 1);
            assert.deepEqual(this.eventNames(), ['chat.added_participant']);
            assert.strictEqual(this.events[0].args[1], chatChannel, 'the channel travels with the event');
        });

        test('removing one destroys it and announces it', async function (assert) {
            const participant = this.store.createRecord('chat-message', {});
            const chatChannel = channel('channel-1');

            await this.service.removeParticipant(chatChannel, participant);

            assert.true(participant.destroyed);
            assert.deepEqual(this.eventNames(), ['chat.removed_participant']);
        });
    });

    module('messages', function () {
        test('sending one saves it and appends it to the feed', async function (assert) {
            const chatChannel = channel('channel-1');

            const message = await this.service.sendMessage(chatChannel, { id: 'user-1' }, 'Hello');

            assert.strictEqual(message.content, 'Hello');
            assert.strictEqual(chatChannel.feed.length, 1);
            assert.strictEqual(chatChannel.feed[0].type, 'message');
            assert.strictEqual(chatChannel.feed[0].record, message);
        });

        test('both feed and message events fire', async function (assert) {
            await this.service.sendMessage(channel(), { id: 'user-1' }, 'Hello');

            assert.deepEqual(this.eventNames(), ['chat.feed_updated', 'chat.message_created']);
        });

        test('a message already in the feed is not appended twice', async function (assert) {
            const chatChannel = channel('channel-1');
            chatChannel.doesntExistsInFeed = () => false;

            await this.service.sendMessage(chatChannel, { id: 'user-1' }, 'Hello');

            assert.strictEqual(chatChannel.feed.length, 0);
            assert.deepEqual(this.eventNames(), ['chat.feed_updated', 'chat.message_created'], 'the events still fire');
        });

        test('the content defaults to empty', async function (assert) {
            const message = await this.service.sendMessage(channel(), { id: 'user-1' });

            assert.strictEqual(message.content, '');
        });

        test('deleting a message destroys it and announces both events', async function (assert) {
            const message = this.store.createRecord('chat-message', {});

            await this.service.deleteMessage(message);

            assert.true(message.destroyed);
            assert.deepEqual(this.eventNames(), ['chat.feed_updated', 'chat.message_deleted']);
        });
    });

    module('socket inserts', function () {
        test('a message is normalized, pushed and added to the feed', function (assert) {
            const chatChannel = channel('channel-1');

            this.service.insertChatMessageFromSocket(chatChannel, { uuid: 'm1', content: 'Hi', created_at: '2026-01-01' });

            assert.strictEqual(chatChannel.feed.length, 1);
            assert.strictEqual(chatChannel.feed[0].type, 'message');
            assert.strictEqual(chatChannel.feed[0].record.content, 'Hi');
            assert.deepEqual(this.eventNames(), ['chat.feed_updated', 'chat.message_created']);
        });

        test('a message already in the feed is ignored entirely', function (assert) {
            const chatChannel = channel('channel-1');
            chatChannel.existsInFeed = () => true;

            this.service.insertChatMessageFromSocket(chatChannel, { uuid: 'm1', content: 'Hi' });

            assert.strictEqual(chatChannel.feed.length, 0);
            assert.deepEqual(this.eventNames(), [], 'no events either');
        });

        test('a log is added to the feed', function (assert) {
            const chatChannel = channel('channel-1');

            this.service.insertChatLogFromSocket(chatChannel, { uuid: 'l1', event: 'joined', created_at: '2026-01-01' });

            assert.strictEqual(chatChannel.feed[0].type, 'log');
            assert.strictEqual(chatChannel.feed[0].record.event, 'joined');
        });

        test('an attachment is attached to the message it belongs to', function (assert) {
            const chatChannel = channel('channel-1');
            const message = this.messageInFeed(chatChannel, 'm1');

            this.service.insertChatAttachmentFromSocket(chatChannel, { uuid: 'a1', filename: 'photo.png', chat_message_uuid: 'm1' });

            assert.deepEqual(
                message.attachments.map((a) => a.id),
                ['a1'],
                'attachments join the message, not the feed'
            );
            assert.strictEqual(chatChannel.feed.length, 1, 'no feed item is added');
            assert.deepEqual(this.eventNames(), ['chat.feed_updated', 'chat.attachment_created']);
        });

        test('an attachment with no matching message is dropped', function (assert) {
            const chatChannel = channel('channel-1');
            this.messageInFeed(chatChannel, 'm1');

            this.service.insertChatAttachmentFromSocket(chatChannel, { uuid: 'a1', chat_message_uuid: 'other' });

            assert.deepEqual(this.eventNames(), []);
        });

        test('an attachment already on the message is not duplicated', function (assert) {
            const chatChannel = channel('channel-1');
            this.messageInFeed(chatChannel, 'm1');

            this.service.insertChatAttachmentFromSocket(chatChannel, { uuid: 'a1', chat_message_uuid: 'm1' });
            this.events.length = 0;
            this.service.insertChatAttachmentFromSocket(chatChannel, { uuid: 'a1', chat_message_uuid: 'm1' });

            assert.strictEqual(chatChannel.feed[0].record.attachments.length, 1);
            assert.deepEqual(this.eventNames(), []);
        });

        test('a receipt is attached to its message and fires one event', function (assert) {
            const chatChannel = channel('channel-1');
            const message = this.messageInFeed(chatChannel, 'm1');

            this.service.insertChatReceiptFromSocket(chatChannel, { uuid: 'r1', chat_message_uuid: 'm1' });

            assert.deepEqual(
                message.receipts.map((r) => r.id),
                ['r1']
            );
            assert.deepEqual(this.eventNames(), ['chat.receipt_created'], 'unlike attachments, no feed_updated');
        });

        test('a receipt with no matching message is dropped', function (assert) {
            const chatChannel = channel('channel-1');
            this.messageInFeed(chatChannel, 'm1');

            this.service.insertChatReceiptFromSocket(chatChannel, { uuid: 'r1', chat_message_uuid: 'other' });

            assert.deepEqual(this.eventNames(), []);
        });

        test('a receipt already on the message is not duplicated', function (assert) {
            const chatChannel = channel('channel-1');
            this.messageInFeed(chatChannel, 'm1');

            this.service.insertChatReceiptFromSocket(chatChannel, { uuid: 'r1', chat_message_uuid: 'm1' });
            this.events.length = 0;
            this.service.insertChatReceiptFromSocket(chatChannel, { uuid: 'r1', chat_message_uuid: 'm1' });

            assert.strictEqual(chatChannel.feed[0].record.receipts.length, 1);
            assert.deepEqual(this.eventNames(), []);
        });

        test('log inserts respect the feed existence check', function (assert) {
            const chatChannel = channel('channel-1');
            chatChannel.existsInFeed = () => true;

            this.service.insertChatLogFromSocket(chatChannel, { uuid: 'l1' });

            assert.strictEqual(chatChannel.feed.length, 0);
        });
    });
});

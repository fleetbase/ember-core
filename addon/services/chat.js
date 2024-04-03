import Service, { inject as service } from '@ember/service';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
import { isArray } from '@ember/array';
import { task } from 'ember-concurrency';

export default class ChatService extends Service.extend(Evented) {
    @service store;
    @service currentUser;
    @tracked channels = [];
    @tracked openChannels = [];

    openChannel(chatChannelRecord) {
        this.openChannels.pushObject(chatChannelRecord);
        this.trigger('chat.opened', chatChannelRecord);
    }

    closeChannel(chatChannelRecord) {
        const index = this.openChannels.findIndex((_) => _.id === chatChannelRecord.id);
        if (index >= 0) {
            this.openChannels.removeAt(index);
            this.trigger('chat.closed', chatChannelRecord);
        }
    }

    getOpenChannels() {
        return this.openChannels;
    }

    createChatChannel(name) {
        const chatChannel = this.store.createRecord('chat-channel', { name });
        return chatChannel.save().finally(() => {
            this.trigger('chat.created', chatChannelRecord);
        });
    }

    deleteChatChannel(chatChannelRecord) {
        return chatChannelRecord.destroyRecord().finally(() => {
            this.trigger('chat.deleted', chatChannelRecord);
        });
    }

    updateChatChannel(chatChannelRecord, props = {}) {
        chatChannelRecord.setProperties(props);
        return chatChannelRecord.save().finally(() => {
            this.trigger('chat.updated', chatChannelRecord);
        });
    }

    addParticipant(chatChannelRecord, userRecord) {
        const chatParticipant = this.store.createRecord('chat-participant', {
            chat_channel_uuid: chatChannelRecord.id,
            user_uuid: userRecord.id,
        });
        return chatParticipant.save().finally(() => {
            this.trigger('chat.added_participant', chatChannelRecord, chatParticipant);
        });
    }

    removeParticipant(chatParticipant) {
        return chatParticipant.destroyRecord().finally(() => {
            this.trigger('chat.removed_participant', chatChannelRecord, chatParticipant);
        });
    }

    async sendMessage(chatChannelRecord, senderRecord, messageContent = '') {
        const chatMessage = this.store.createRecord('chat-message', {
            chat_channel_uuid: chatChannelRecord.id,
            sender_uuid: senderRecord.id,
            content: messageContent,
        });
        await chatMessage.save().finally(() => {
            this.trigger('chat.message_created', chatMessage, chatChannelRecord);
        });
        chatChannelRecord.messages.pushObject(chatMessage);
        await this.loadMessages.perform(chatChannelRecord);
    }

    deleteMessage(chatMessageRecord) {
        return chatMessageRecord.destroyRecord().finally(() => {
            this.trigger('chat.message_deleted', chatMessageRecord);
        });
    }

    @task *loadMessages(chatChannelRecord) {
        const messages = yield this.store.query('chat-message', { chat_channel_uuid: chatChannelRecord.id });
        chatChannelRecord.set('messages', messages);
        return messages;
    }

    @task *loadChannels(options = {}) {
        const params = options.params || {};
        const channels = yield this.store.query('chat-channel', params);
        if (isArray(channels)) {
            this.channels = channels;
        }

        if (typeof options.withChannels === 'function') {
            options.withChannels(channels);
        }

        return channels;
    }
}

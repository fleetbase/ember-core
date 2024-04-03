import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { isArray } from '@ember/array';
import { task } from 'ember-concurrency';

export default class ChatService extends Service {
    @service store;
    @service currentUser;
    @tracked channels = [];
    @tracked openChannels = [];

    openChannel(chatChannelRecord) {
        this.openChannels.pushObject(chatChannelRecord);
    }

    closeChannel(chatChannelRecord) {
        const index = this.openChannels.findIndex((_) => _.id === chatChannelRecord.id);
        if (index >= 0) {
            this.openChannels.removeAt(index);
        }
    }

    getOpenChannels() {
        return this.openChannels;
    }

    createChatChannel(name) {
        const chatChannel = this.store.createRecord('chat-channel', { name });
        return chatChannel.save();
    }

    deleteChatChannel(chatChannelRecord) {
        return chatChannelRecord.destroyRecord();
    }

    updateChatChannel(chatChannelRecord, props = {}) {
        chatChannelRecord.setProperties(props);
        return chatChannelRecord.save();
    }

    addParticipant(chatChannelRecord, userRecord) {
        const chatParticipant = this.store.createRecord('chat-participant', {
            chat_channel_uuid: chatChannelRecord.id,
            user_uuid: userRecord.id,
        });
        return chatParticipant.save();
    }

    removeParticipant(chatParticipant) {
        return chatParticipant.destroyRecord();
    }

    async sendMessage(chatChannelRecord, senderRecord, messageContent = '') {
        const chatMessage = this.store.createRecord('chat-message', {
            chat_channel_uuid: chatChannelRecord.id,
            sender_uuid: senderRecord.id,
            content: messageContent,
        });
        await chatMessage.save();
        chatChannelRecord.messages.pushObject(chatMessage);
        await this.loadMessages.perform(chatChannelRecord);
    }

    deleteMessage(chatMessageRecord) {
        return chatMessageRecord.destroyRecord();
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

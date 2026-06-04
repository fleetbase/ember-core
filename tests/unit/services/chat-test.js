import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

module('Unit | Service | chat', function (hooks) {
    setupTest(hooks);

    test('it exists', function (assert) {
        let service = this.owner.lookup('service:chat');
        assert.ok(service);
    });

    test('createChatChannel posts initial participants', async function (assert) {
        assert.expect(5);

        class FetchStub extends Service {
            post(path, data, options) {
                assert.strictEqual(path, 'chat-channels');
                assert.deepEqual(data, {
                    chatChannel: {
                        name: 'Dispatch',
                        participants: ['user-1', 'user-2'],
                    },
                });
                assert.deepEqual(options, {
                    normalizeToEmberData: true,
                    normalizeModelType: 'chatChannel',
                });

                return Promise.resolve({ id: 'chat-1' });
            }
        }

        this.owner.register('service:fetch', FetchStub);

        const service = this.owner.lookup('service:chat');
        service.on('chat.created', (record) => {
            assert.deepEqual(record, { id: 'chat-1' });
        });

        const record = await service.createChatChannel('Dispatch', ['user-1', 'user-2']);
        assert.deepEqual(record, { id: 'chat-1' });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * openChannel/closeChannel keep two lists in step: the in-memory openChannels
 * array and the 'open-chats' entry in the app cache, which survives a reload.
 */
function channel(id) {
    return { id, name: `Channel ${id}` };
}

module('Unit | Service | chat (open channels)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.cache = {};
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

        this.owner.register('service:current-user', class extends Service {});
        this.owner.register('service:fetch', class extends Service {});
        this.owner.register('service:socket', class extends Service {});
        this.owner.register('service:store', class extends Service {});

        this.service = this.owner.lookup('service:chat');
        this.events = [];
        this.service.trigger = (name, record) => this.events.push({ name, id: record?.id });
    });

    test('it starts with no open channels', function (assert) {
        assert.deepEqual(this.service.openChannels, []);
    });

    test('opening a channel tracks it and remembers it in the cache', function (assert) {
        const a = channel('a');

        this.service.openChannel(a);

        assert.deepEqual(this.service.openChannels, [a]);
        assert.deepEqual(this.cache['open-chats'], ['a']);
        assert.deepEqual(this.events, [{ name: 'chat.opened', id: 'a' }]);
    });

    test('opening several channels keeps them all', function (assert) {
        this.service.openChannel(channel('a'));
        this.service.openChannel(channel('b'));

        assert.deepEqual(
            this.service.openChannels.map((c) => c.id),
            ['a', 'b']
        );
        assert.deepEqual(this.cache['open-chats'], ['a', 'b']);
    });

    test('opening the same channel twice is a no-op', function (assert) {
        const a = channel('a');

        this.service.openChannel(a);
        this.service.openChannel(a);

        assert.strictEqual(this.service.openChannels.length, 1);
        assert.strictEqual(this.events.length, 1, 'chat.opened fires once');
    });

    test('closing a channel drops it and forgets it', function (assert) {
        const a = channel('a');
        const b = channel('b');
        this.service.openChannel(a);
        this.service.openChannel(b);
        this.events.length = 0;

        this.service.closeChannel(a);

        assert.deepEqual(
            this.service.openChannels.map((c) => c.id),
            ['b'],
            'only the closed channel is removed'
        );
        assert.deepEqual(this.cache['open-chats'], ['b']);
        assert.deepEqual(this.events, [{ name: 'chat.closed', id: 'a' }]);
    });

    test('closing matches by id rather than identity', function (assert) {
        this.service.openChannel(channel('a'));

        this.service.closeChannel({ id: 'a' });

        assert.deepEqual(this.service.openChannels, []);
    });

    test('closing a channel that is not open does not fire chat.closed', function (assert) {
        this.service.openChannel(channel('a'));
        this.events.length = 0;

        this.service.closeChannel(channel('zzz'));

        assert.strictEqual(this.service.openChannels.length, 1);
        assert.deepEqual(this.events, [], 'no event for a channel that was not open');
    });

    test('closing every channel empties both the list and the cache', function (assert) {
        const a = channel('a');
        this.service.openChannel(a);

        this.service.closeChannel(a);

        assert.deepEqual(this.service.openChannels, []);
        assert.deepEqual(this.cache['open-chats'], []);
    });

    test('a non-array cache entry is replaced rather than appended to', function (assert) {
        this.cache['open-chats'] = 'corrupted';

        this.service.openChannel(channel('a'));

        assert.deepEqual(this.cache['open-chats'], ['a'], 'the bad value is discarded');
    });

    test('forgetting against a non-array cache entry resets it', function (assert) {
        const a = channel('a');
        this.service.openChannel(a);
        this.cache['open-chats'] = 'corrupted';

        this.service.closeChannel(a);

        assert.deepEqual(this.cache['open-chats'], []);
    });
});

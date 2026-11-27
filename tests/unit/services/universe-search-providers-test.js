import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

/**
 * Command palette search providers are registered on universe and stored in
 * the shared registry under search:provider, so every engine sees the same list.
 */
module('Unit | Service | universe (search providers)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.universe = this.owner.lookup('service:universe');
        this.universe.registryService.clearList?.('search', 'provider');
    });

    test('a provider is registered, normalised and listed', async function (assert) {
        const events = [];
        this.universe.on('searchProvider.registered', (provider) => events.push(provider.id));

        const provider = {
            id: 'orders',
            label: 'Orders',
            icon: 'box',
            scope: 'fleet-ops',
            search(query) {
                return Promise.resolve([{ id: 'o1', title: `Order ${query}`, route: 'console.orders.details', models: ['o1'] }, null, { id: 'o2', title: 'Other', group: 'Recent' }]);
            },
        };

        const registered = this.universe.registerSearchProvider(provider);
        assert.deepEqual(events, ['orders']);
        assert.strictEqual(registered.label, 'Orders');
        assert.strictEqual(registered.icon, 'box');
        assert.strictEqual(registered.scope, 'fleet-ops', 'extra keys are kept');

        const [listed] = this.universe.getSearchProviders();
        assert.strictEqual(listed.id, 'orders');

        assert.deepEqual(await listed.search('42'), [
            { id: 'o1', title: 'Order 42', route: 'console.orders.details', models: ['o1'], group: 'Orders' },
            { id: 'o2', title: 'Other', group: 'Recent' },
        ]);
    });

    test('label and icon default; a non-array result becomes empty', async function (assert) {
        const registered = this.universe.registerSearchProvider({ id: 'places', search: () => 'nope' });
        assert.strictEqual(registered.label, 'places');
        assert.strictEqual(registered.icon, null);
        assert.deepEqual(await registered.search('x'), []);
    });

    test('search is called with the provider as this', async function (assert) {
        const provider = {
            id: 'ctx',
            prefix: 'P',
            search(query) {
                return [{ id: '1', title: this.prefix + query }];
            },
        };
        const [result] = await this.universe.registerSearchProvider(provider).search('q');
        assert.strictEqual(result.title, 'Pq');
    });

    test('registering the same id replaces the provider', function (assert) {
        this.universe.registerSearchProvider({ id: 'dup', label: 'One', search: () => [] });
        this.universe.registerSearchProvider({ id: 'dup', label: 'Two', search: () => [] });

        const matches = this.universe.getSearchProviders().filter((p) => p.id === 'dup');
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].label, 'Two');
    });

    test('getSearchProviders returns a copy', function (assert) {
        this.universe.registerSearchProvider({ id: 'copy', search: () => [] });
        this.universe.getSearchProviders().length = 0;
        assert.ok(this.universe.getSearchProviders().length >= 1);
    });

    test('an id and a search function are required', function (assert) {
        assert.throws(() => this.universe.registerSearchProvider(), /string id/);
        assert.throws(() => this.universe.registerSearchProvider(null), /string id/);
        assert.throws(() => this.universe.registerSearchProvider({ id: 5, search() {} }), /string id/);
        assert.throws(() => this.universe.registerSearchProvider({ id: 'x' }), /search\(query\)/);
    });
});

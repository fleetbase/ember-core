import { module, test } from 'qunit';
import MenuItem from '@fleetbase/ember-core/contracts/menu-item';

/**
 * The three chaining setters the sibling contract test does not reach, one of
 * which cannot be reached through an instance at all.
 */
module('Unit | Contract | menu-item (chaining)', function () {
    test('withComponentParams stores the params and chains', function (assert) {
        const item = new MenuItem('Orders', 'console.orders');

        const returned = item.withComponentParams({ view: 'compact' });

        assert.strictEqual(returned, item, 'it chains');
        assert.deepEqual(item.toObject().componentParams, { view: 'compact' });
    });

    test('withShortcuts stores a list and chains', function (assert) {
        const item = new MenuItem('Orders', 'console.orders');
        const shortcuts = [{ title: 'New order', route: 'console.orders.new' }];

        const returned = item.withShortcuts(shortcuts);

        assert.strictEqual(returned, item);
        assert.deepEqual(item.shortcuts, shortcuts);
        assert.deepEqual(item.toObject().shortcuts, shortcuts);
    });

    test('withShortcuts nulls anything that is not a list', function (assert) {
        const item = new MenuItem('Orders', 'console.orders');

        item.withShortcuts('not a list');

        assert.strictEqual(item.shortcuts, null);
        assert.strictEqual(item.toObject().shortcuts, null);
    });

    test('withOnClick sets the handler and chains', function (assert) {
        // `onClick` is the handler property every consumer calls, so the setter has its own
        // name; a method called `onClick` was shadowed by that property on every instance.
        const item = new MenuItem('Orders', 'console.orders');
        const handler = () => 'clicked';

        assert.strictEqual(item.onClick, null, 'no handler until one is set');
        assert.strictEqual(item.withOnClick(handler), item, 'it chains like every other setter');
        assert.strictEqual(item.onClick, handler);
        assert.strictEqual(item.toObject().onClick, handler, 'and stores the handler where the menu service expects it');
    });
});

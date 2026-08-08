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

    test('the onClick chaining method works, but no instance can reach it', function (assert) {
        // Already on the defect register: MenuItem declares `onClick(handler)`
        // as a chaining setter AND its constructor assigns `this.onClick = null`,
        // so every instance shadows the method with a null field and
        // `item.onClick(fn)` throws.
        //
        // Calling it off the prototype shows the method itself is fine — it is
        // only unreachable — which is the half a fixer needs. Dropping the
        // constructor assignment is all that stands between the two.
        const item = new MenuItem('Orders', 'console.orders');
        const handler = () => 'clicked';

        assert.strictEqual(item.onClick, null, 'the field shadows the method');
        assert.throws(() => item.onClick(handler), /not a function/);

        const returned = MenuItem.prototype.onClick.call(item, handler);

        assert.strictEqual(returned, item, 'it chains like every other setter');
        assert.strictEqual(item.toObject().onClick, handler, 'and stores the handler where the menu service expects it');
    });
});

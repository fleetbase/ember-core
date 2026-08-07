import MenuPanel from '@fleetbase/ember-core/contracts/menu-panel';
import MenuItem from '@fleetbase/ember-core/contracts/menu-item';
import { module, test } from 'qunit';

module('Unit | Contract | menu-panel', function () {
    module('construction from a title', function () {
        test('it dasherizes the title into a slug and applies defaults', function (assert) {
            const panel = new MenuPanel('Fleet Operations');

            assert.strictEqual(panel.title, 'Fleet Operations');
            assert.strictEqual(panel.slug, 'fleet-operations');
            assert.strictEqual(panel.icon, null);
            assert.true(panel.open);
            assert.strictEqual(panel.priority, 9);
            assert.deepEqual(panel.items, []);
        });

        test('items can be supplied as the second argument', function (assert) {
            const items = [{ title: 'Orders' }];

            assert.deepEqual(new MenuPanel('Fleet', items).items, items);
        });
    });

    module('construction from a definition', function () {
        test('it reads every field', function (assert) {
            const panel = new MenuPanel({
                title: 'Fleet Operations',
                slug: 'ops',
                icon: 'truck',
                open: false,
                priority: 1,
                items: [{ title: 'Orders' }],
            });

            assert.strictEqual(panel.title, 'Fleet Operations');
            assert.strictEqual(panel.slug, 'ops');
            assert.strictEqual(panel.icon, 'truck');
            assert.false(panel.open);
            assert.strictEqual(panel.priority, 1);
            assert.deepEqual(panel.items, [{ title: 'Orders' }]);
        });

        test('a definition falls back to the same defaults', function (assert) {
            const panel = new MenuPanel({ title: 'Fleet Ops' });

            assert.strictEqual(panel.slug, 'fleet-ops', 'the slug is derived from the title');
            assert.strictEqual(panel.icon, null);
            assert.true(panel.open);
            assert.strictEqual(panel.priority, 9);
            assert.deepEqual(panel.items, []);
        });

        test('explicit false and zero are preserved rather than replaced', function (assert) {
            const panel = new MenuPanel({ title: 'Fleet', open: false, priority: 0 });

            assert.false(panel.open);
            assert.strictEqual(panel.priority, 0);
        });
    });

    module('validation', function () {
        test('an empty title is rejected with the intended error', function (assert) {
            assert.throws(() => new MenuPanel(''), /MenuPanel requires a title/);
        });

        test('a missing title fails earlier, with a TypeError from dasherize', function (assert) {
            // NOTE: the slug is derived with dasherize(title) before super.setup()
            // runs, so an undefined title blows up inside dasherize and the
            // "MenuPanel requires a title" message is never reached. The failure is
            // still loud, just less helpful than the one the author intended.
            assert.throws(() => new MenuPanel(), TypeError);
        });
    });

    module('chaining', function () {
        test('the setters assign and keep options in step', function (assert) {
            const panel = new MenuPanel('Fleet').withSlug('ops').withIcon('truck').withPriority(2);

            assert.strictEqual(panel.slug, 'ops');
            assert.strictEqual(panel.getOption('slug'), 'ops');
            assert.strictEqual(panel.icon, 'truck');
            assert.strictEqual(panel.priority, 2);
            assert.strictEqual(panel.getOption('priority'), 2);
        });

        test('addItem appends a plain item and returns the panel', function (assert) {
            const panel = new MenuPanel('Fleet');
            const item = { title: 'Orders' };

            assert.strictEqual(panel.addItem(item), panel);
            assert.deepEqual(panel.items, [item]);
        });

        test('addItem flattens a MenuItem to its object form', function (assert) {
            const panel = new MenuPanel('Fleet');
            const item = new MenuItem('Orders');

            panel.addItem(item);

            assert.deepEqual(panel.items[0], item.toObject());
            assert.notStrictEqual(panel.items[0], item, 'the contract instance itself is not stored');
        });

        test('addItems appends each entry', function (assert) {
            const panel = new MenuPanel('Fleet');

            assert.strictEqual(panel.addItems([{ title: 'A' }, new MenuItem('B')]), panel);
            assert.strictEqual(panel.items.length, 2);
            assert.strictEqual(panel.items[0].title, 'A');
            assert.strictEqual(panel.items[1].title, 'B');
        });

        test('addItems with an empty list leaves the panel alone', function (assert) {
            const panel = new MenuPanel('Fleet');

            panel.addItems([]);

            assert.deepEqual(panel.items, []);
        });
    });

    module('toObject', function () {
        test('it exposes every field and marks itself as a panel', function (assert) {
            const object = new MenuPanel('Fleet Operations').withIcon('truck').addItem({ title: 'Orders' }).toObject();

            assert.strictEqual(object.title, 'Fleet Operations');
            assert.strictEqual(object.slug, 'fleet-operations');
            assert.strictEqual(object.icon, 'truck');
            assert.true(object.open);
            assert.strictEqual(object.priority, 9);
            assert.deepEqual(object.items, [{ title: 'Orders' }]);
            assert.true(object._isMenuPanel, 'the indicator flag lets consumers tell panels from items');
        });
    });
});

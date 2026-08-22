import MenuItem from '@fleetbase/ember-core/contracts/menu-item';
import ExtensionComponent from '@fleetbase/ember-core/contracts/extension-component';
import { module, test } from 'qunit';

module('Unit | Contract | menu-item', function () {
    module('construction from a title', function () {
        test('the title seeds text, label, id, slug and view', function (assert) {
            const item = new MenuItem('Fleet Orders');

            assert.strictEqual(item.title, 'Fleet Orders');
            assert.strictEqual(item.text, 'Fleet Orders');
            assert.strictEqual(item.label, 'Fleet Orders');
            assert.strictEqual(item.id, 'fleet-orders');
            assert.strictEqual(item.slug, 'fleet-orders');
            assert.strictEqual(item.view, 'fleet-orders');
        });

        test('a route can be passed as the second argument', function (assert) {
            assert.strictEqual(new MenuItem('Orders', 'console.orders').route, 'console.orders');
            assert.strictEqual(new MenuItem('Orders').route, null);
        });

        test('it applies the documented defaults', function (assert) {
            const item = new MenuItem('Orders');

            assert.strictEqual(item.icon, 'circle-dot');
            assert.strictEqual(item.priority, 9);
            assert.strictEqual(item.index, 0);
            assert.strictEqual(item.type, 'default');
            assert.false(item.disabled);
            assert.false(item.isLoading);
            assert.false(item.renderComponentInPlace);
            assert.false(item.overwriteWrapperClass);
            assert.deepEqual(item.queryParams, {});
            assert.deepEqual(item.routeParams, []);
            assert.deepEqual(item.componentParams, {});
            assert.strictEqual(item.items, null);
            assert.strictEqual(item.description, null);
            assert.strictEqual(item.shortcuts, null);
            assert.strictEqual(item.tags, null);
        });
    });

    module('construction from a definition', function () {
        test('text and label fall back to the title', function (assert) {
            const item = new MenuItem({ title: 'Orders' });

            assert.strictEqual(item.text, 'Orders');
            assert.strictEqual(item.label, 'Orders');
        });

        test('explicit text and label win over the title', function (assert) {
            const item = new MenuItem({ title: 'Orders', text: 'All orders', label: 'Orders (all)' });

            assert.strictEqual(item.text, 'All orders');
            assert.strictEqual(item.label, 'Orders (all)');
        });

        test('id and slug are derived from the title when absent', function (assert) {
            const item = new MenuItem({ title: 'Fleet Orders' });

            assert.strictEqual(item.id, 'fleet-orders');
            assert.strictEqual(item.slug, 'fleet-orders');
        });

        test('explicit id and slug are kept', function (assert) {
            const item = new MenuItem({ title: 'Orders', id: 'custom-id', slug: 'custom-slug' });

            assert.strictEqual(item.id, 'custom-id');
            assert.strictEqual(item.slug, 'custom-slug');
        });

        test('a zero priority or index is preserved rather than defaulted', function (assert) {
            const item = new MenuItem({ title: 'Orders', priority: 0, index: 0 });

            assert.strictEqual(item.priority, 0);
            assert.strictEqual(item.index, 0);
        });

        test('tags are normalised to an array', function (assert) {
            assert.deepEqual(new MenuItem({ title: 'O', tags: ['a', 'b'] }).tags, ['a', 'b']);
            assert.deepEqual(new MenuItem({ title: 'O', tags: 'single' }).tags, ['single'], 'a bare string is wrapped');
            assert.strictEqual(new MenuItem({ title: 'O' }).tags, null);
            assert.strictEqual(new MenuItem({ title: 'O', tags: '' }).tags, null, 'an empty string yields null');
        });

        test('nested items and shortcuts are carried through', function (assert) {
            const items = [{ title: 'Child' }];
            const shortcuts = [{ title: 'Shortcut', route: 'console.x' }];
            const item = new MenuItem({ title: 'Parent', items, shortcuts, description: 'A parent' });

            assert.deepEqual(item.items, items);
            assert.deepEqual(item.shortcuts, shortcuts);
            assert.strictEqual(item.description, 'A parent');
        });

        test('a definition with no title leaves the derived fields null', function (assert) {
            // isObject gates the definition branch on the object alone, so a
            // definition without a title reaches validation with title null.
            assert.throws(() => new MenuItem({ route: 'console.orders' }), /MenuItem requires a title/);
        });
    });

    module('validation', function () {
        test('it requires a title', function (assert) {
            assert.throws(() => new MenuItem({}), /MenuItem requires a title/);
        });
    });

    module('chaining', function () {
        test('the display setters assign and keep options in step', function (assert) {
            const item = new MenuItem('Orders').withIcon('truck').withPriority(1).atIndex(2).withType('button').inSection('ops').withSlug('custom');

            assert.strictEqual(item.icon, 'truck');
            assert.strictEqual(item.getOption('icon'), 'truck');
            assert.strictEqual(item.priority, 1);
            assert.strictEqual(item.index, 2);
            assert.strictEqual(item.type, 'button');
            assert.strictEqual(item.section, 'ops');
            assert.strictEqual(item.slug, 'custom');
        });

        test('withComponent accepts a string or an ExtensionComponent', function (assert) {
            assert.strictEqual(new MenuItem('O').withComponent('widgets/x').component, 'widgets/x');

            const component = new ExtensionComponent('fleet-ops', 'widgets/y');
            assert.deepEqual(new MenuItem('O').withComponent(component).component, component.toObject());
        });

        test('the routing setters store their arguments', function (assert) {
            const item = new MenuItem('O').withQueryParams({ page: 2 }).withRouteParams('a', 'b');

            assert.deepEqual(item.queryParams, { page: 2 });
            assert.deepEqual(item.routeParams, ['a', 'b'], 'rest parameters are collected into an array');
        });

        test('withTags normalises exactly like the constructor', function (assert) {
            assert.deepEqual(new MenuItem('O').withTags(['a']).tags, ['a']);
            assert.deepEqual(new MenuItem('O').withTags('single').tags, ['single']);
            assert.strictEqual(new MenuItem('O').withTags(null).tags, null);
        });

        test('addShortcut starts a list and appends to it', function (assert) {
            const item = new MenuItem('O');

            item.addShortcut({ title: 'One' });
            assert.strictEqual(item.shortcuts.length, 1);

            item.addShortcut({ title: 'Two' });
            assert.deepEqual(
                item.shortcuts.map((shortcut) => shortcut.title),
                ['One', 'Two']
            );
        });

        test('renderInPlace records the option but leaves the property stale', function (assert) {
            // NOTE: every other setter updates both the property and the option.
            // This one only sets the option, so the instance property keeps its
            // old value. toObject still reports the right answer because the
            // options are spread last, but reading item.renderComponentInPlace
            // directly is misleading.
            const item = new MenuItem('O').renderInPlace();

            assert.false(item.renderComponentInPlace, 'the property is not updated');
            assert.true(item.toObject().renderComponentInPlace, 'the serialised form is correct');
        });

        test('the fluent calls compose and each returns the item', function (assert) {
            const item = new MenuItem('Orders');

            assert.strictEqual(item.withIcon('truck').withPriority(1).inSection('ops').withDescription('d').withTags('t').addShortcut({ title: 's' }), item);
        });
    });

    module('the onClick collision', function () {
        test('the onClick chaining method is unreachable', function (assert) {
            // NOTE: the constructor assigns `this.onClick = definition.onClick || null`,
            // an instance property that shadows the prototype method of the same
            // name. So the documented `.onClick(handler)` chaining call tries to
            // invoke null and throws. Handlers have to be passed in the definition.
            const item = new MenuItem('Orders');

            assert.strictEqual(item.onClick, null, 'the property shadows the method');
            assert.throws(() => item.onClick(() => {}), TypeError);
        });

        test('a handler supplied in the definition is stored', function (assert) {
            const handler = () => 'clicked';
            const item = new MenuItem({ title: 'Orders', onClick: handler });

            assert.strictEqual(item.onClick, handler);
            assert.strictEqual(item.onClick(), 'clicked', 'it is callable because it is the handler itself');
        });
    });

    module('toObject', function () {
        test('it exposes the core fields', function (assert) {
            const object = new MenuItem('Fleet Orders', 'console.orders').withIcon('truck').toObject();

            assert.strictEqual(object.id, 'fleet-orders');
            assert.strictEqual(object.title, 'Fleet Orders');
            assert.strictEqual(object.route, 'console.orders');
            assert.strictEqual(object.icon, 'truck');
            assert.strictEqual(object.priority, 9);
            assert.strictEqual(object.type, 'default');
        });

        test('later option writes win over the constructed properties', function (assert) {
            const object = new MenuItem('Orders').withPriority(1).toObject();

            assert.strictEqual(object.priority, 1);
        });
    });
});

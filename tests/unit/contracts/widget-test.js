import Widget from '@fleetbase/ember-core/contracts/widget';
import ExtensionComponent from '@fleetbase/ember-core/contracts/extension-component';
import { module, test } from 'qunit';

module('Unit | Contract | widget', function () {
    module('construction from an id', function () {
        test('a bare id gets empty defaults', function (assert) {
            const widget = new Widget('fleet-stats');

            assert.strictEqual(widget.id, 'fleet-stats');
            assert.strictEqual(widget.name, null);
            assert.strictEqual(widget.description, null);
            assert.strictEqual(widget.icon, null);
            assert.strictEqual(widget.component, null);
            assert.deepEqual(widget.grid_options, {});
            assert.deepEqual(widget.options, {});
            assert.strictEqual(widget.category, 'default');
        });
    });

    module('construction from a definition', function () {
        test('it reads every field', function (assert) {
            const widget = new Widget({
                id: 'fleet-stats',
                name: 'Fleet stats',
                description: 'Vehicle counts',
                icon: 'truck',
                component: 'widgets/fleet-stats',
                grid_options: { w: 4, h: 2 },
                options: { title: 'Fleet' },
                category: 'operations',
            });

            assert.strictEqual(widget.id, 'fleet-stats');
            assert.strictEqual(widget.name, 'Fleet stats');
            assert.strictEqual(widget.description, 'Vehicle counts');
            assert.strictEqual(widget.icon, 'truck');
            assert.strictEqual(widget.component, 'widgets/fleet-stats');
            assert.deepEqual(widget.grid_options, { w: 4, h: 2 });
            assert.deepEqual(widget.options, { title: 'Fleet' });
            assert.strictEqual(widget.category, 'operations');
        });

        test('widgetId is accepted as a legacy alias for id', function (assert) {
            assert.strictEqual(new Widget({ widgetId: 'legacy' }).id, 'legacy');
        });

        test('id wins when both id and widgetId are supplied', function (assert) {
            assert.strictEqual(new Widget({ id: 'primary', widgetId: 'legacy' }).id, 'primary');
        });

        test('a definition falls back to the same defaults', function (assert) {
            const widget = new Widget({ id: 'minimal' });

            assert.strictEqual(widget.name, null);
            assert.strictEqual(widget.component, null);
            assert.strictEqual(widget.category, 'default');
            assert.deepEqual(widget.grid_options, {});
        });

        test('an ExtensionComponent is flattened to its object form', function (assert) {
            const component = new ExtensionComponent('widgets/fleet-stats');
            const widget = new Widget({ id: 'w', component });

            assert.deepEqual(widget.component, component.toObject());
        });

        test('a plain object component is kept as-is', function (assert) {
            const component = { name: 'widgets/fleet-stats', engine: 'fleet-ops' };

            assert.deepEqual(new Widget({ id: 'w', component }).component, component);
        });

        test('the default flag is carried through', function (assert) {
            assert.true(new Widget({ id: 'w', default: true }).isDefault());
            assert.false(new Widget({ id: 'w' }).isDefault());
            assert.false(new Widget({ id: 'w', default: false }).isDefault());
        });
    });

    module('validation', function () {
        test('it requires an id', function (assert) {
            assert.throws(() => new Widget(), /Widget requires an id/);
            assert.throws(() => new Widget(''), /Widget requires an id/);
            assert.throws(() => new Widget({}), /Widget requires an id/);
        });
    });

    module('chaining', function () {
        test('the simple setters assign and keep options in step', function (assert) {
            const widget = new Widget('w').withName('Name').withDescription('Desc').withIcon('icon').withCategory('ops');

            assert.strictEqual(widget.name, 'Name');
            assert.strictEqual(widget.getOption('name'), 'Name');
            assert.strictEqual(widget.description, 'Desc');
            assert.strictEqual(widget.icon, 'icon');
            assert.strictEqual(widget.category, 'ops');
            assert.strictEqual(widget.getOption('category'), 'ops');
        });

        test('withComponent accepts a string or an ExtensionComponent', function (assert) {
            assert.strictEqual(new Widget('w').withComponent('widgets/x').component, 'widgets/x');

            const component = new ExtensionComponent('widgets/y');
            assert.deepEqual(new Widget('w').withComponent(component).component, component.toObject());
        });

        test('withGridOptions and withOptions merge rather than replace', function (assert) {
            const widget = new Widget('w').withGridOptions({ w: 4 }).withGridOptions({ h: 2 }).withOptions({ a: 1 }).withOptions({ b: 2 });

            assert.deepEqual(widget.grid_options, { w: 4, h: 2 });
            assert.deepEqual(widget.options, { a: 1, b: 2 });
        });

        test('withTitle and withRefreshInterval write into options', function (assert) {
            const widget = new Widget('w').withTitle('Fleet').withRefreshInterval(5000);

            assert.strictEqual(widget.options.title, 'Fleet');
            assert.strictEqual(widget.options.refreshInterval, 5000);
        });

        test('asDefault marks the widget as a default', function (assert) {
            const widget = new Widget('w');

            assert.false(widget.isDefault());
            assert.strictEqual(widget.asDefault(), widget);
            assert.true(widget.isDefault());
        });

        test('every setter returns the widget', function (assert) {
            const widget = new Widget('w');

            for (const call of [
                () => widget.withName('n'),
                () => widget.withDescription('d'),
                () => widget.withIcon('i'),
                () => widget.withComponent('c'),
                () => widget.withGridOptions({}),
                () => widget.withOptions({}),
                () => widget.withCategory('c'),
                () => widget.withTitle('t'),
                () => widget.withRefreshInterval(1),
            ]) {
                assert.strictEqual(call(), widget);
            }
        });
    });

    module('toObject', function () {
        test('it exposes every widget property', function (assert) {
            const object = new Widget('w').withName('Name').withCategory('ops').toObject();

            assert.strictEqual(object.id, 'w');
            assert.strictEqual(object.name, 'Name');
            assert.strictEqual(object.category, 'ops');
            assert.deepEqual(object.grid_options, {});
            assert.deepEqual(object.options, {});
            assert.strictEqual(object.description, null);
            assert.strictEqual(object.icon, null);
            assert.strictEqual(object.component, null);
        });

        test('it carries the default flag when set', function (assert) {
            assert.true(new Widget('w').asDefault().toObject().default);
        });
    });
});

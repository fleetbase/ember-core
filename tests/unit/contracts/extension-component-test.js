import ExtensionComponent from '@fleetbase/ember-core/contracts/extension-component';
import { module, test } from 'qunit';

class SomeComponent {}

module('Unit | Contract | extension-component', function () {
    module('construction from a path', function () {
        test('a string path sets the path and mirrors it as the name', function (assert) {
            const component = new ExtensionComponent('fleet-ops', 'widgets/fleet-stats');

            assert.strictEqual(component.engine, 'fleet-ops');
            assert.strictEqual(component.path, 'widgets/fleet-stats');
            assert.strictEqual(component.name, 'widgets/fleet-stats');
            assert.strictEqual(component.class, null);
            assert.false(component.isClass);
            assert.strictEqual(component.loadingComponent, null);
            assert.strictEqual(component.errorComponent, null);
        });

        test('an options object is accepted in place of a path', function (assert) {
            const component = new ExtensionComponent('fleet-ops', {
                path: 'widgets/fleet-stats',
                loadingComponent: 'spinner',
                errorComponent: 'error-box',
            });

            assert.strictEqual(component.path, 'widgets/fleet-stats');
            assert.strictEqual(component.loadingComponent, 'spinner');
            assert.strictEqual(component.errorComponent, 'error-box');
        });
    });

    module('construction from a class', function () {
        test('a component class is stored and named after the class', function (assert) {
            const component = new ExtensionComponent('fleet-ops', SomeComponent);

            assert.strictEqual(component.engine, 'fleet-ops');
            assert.strictEqual(component.class, SomeComponent);
            assert.strictEqual(component.name, 'SomeComponent');
            assert.strictEqual(component.path, null, 'a class has no path');
            assert.true(component.isClass);
        });

        test('the class branch leaves the loading and error components unset', function (assert) {
            const component = new ExtensionComponent('fleet-ops', SomeComponent);

            assert.strictEqual(component.loadingComponent, null);
            assert.strictEqual(component.errorComponent, null);
        });
    });

    module('validation', function () {
        // NOTE: unlike Hook, Widget and Registry, this constructor never calls
        // super.setup(), so validate() is not run on construction. Invalid
        // components are therefore built happily and only fail later, if at all.
        test('an invalid component is constructed without complaint', function (assert) {
            const noEngine = new ExtensionComponent(undefined, 'widgets/x');
            assert.strictEqual(noEngine.engine, undefined, 'a missing engine is not rejected');

            const noTarget = new ExtensionComponent('fleet-ops', {});
            assert.strictEqual(noTarget.path, undefined, 'neither a path nor a class is required');
        });

        test('validate does report those problems when called directly', function (assert) {
            assert.throws(() => new ExtensionComponent(undefined, 'widgets/x').validate(), /requires an engine name/);
            assert.throws(() => new ExtensionComponent('fleet-ops', {}).validate(), /requires a component path or class/);
        });

        test('validate passes for a well-formed component', function (assert) {
            new ExtensionComponent('fleet-ops', 'widgets/x').validate();
            new ExtensionComponent('fleet-ops', SomeComponent).validate();

            assert.true(true, 'neither call throws');
        });
    });

    module('chaining', function () {
        test('the setters assign and return the component', function (assert) {
            const component = new ExtensionComponent('fleet-ops', 'widgets/x');

            assert.strictEqual(component.withLoadingComponent('spinner'), component);
            assert.strictEqual(component.loadingComponent, 'spinner');
            assert.strictEqual(component.getOption('loadingComponent'), 'spinner');

            assert.strictEqual(component.withErrorComponent('error-box'), component);
            assert.strictEqual(component.errorComponent, 'error-box');

            assert.strictEqual(component.withData({ a: 1 }), component);
            assert.deepEqual(component.getOption('data'), { a: 1 });

            assert.strictEqual(component.withTimeout(5000), component);
            assert.strictEqual(component.getOption('timeout'), 5000);
        });
    });

    module('serialisation', function () {
        test('toObject exposes every field', function (assert) {
            const object = new ExtensionComponent('fleet-ops', 'widgets/x').withLoadingComponent('spinner').toObject();

            assert.strictEqual(object.engine, 'fleet-ops');
            assert.strictEqual(object.path, 'widgets/x');
            assert.strictEqual(object.name, 'widgets/x');
            assert.strictEqual(object.class, null);
            assert.false(object.isClass);
            assert.strictEqual(object.loadingComponent, 'spinner');
        });

        test('toString identifies a path component', function (assert) {
            assert.strictEqual(new ExtensionComponent('fleet-ops', 'widgets/x').toString(), '#extension-component:fleet-ops:widgets/x');
        });

        test('toString identifies a class component by its class name', function (assert) {
            assert.strictEqual(new ExtensionComponent('fleet-ops', SomeComponent).toString(), '#extension-component:fleet-ops:SomeComponent');
        });
    });
});

import applyContextComponentArguments from 'dummy/utils/apply-context-component-arguments';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';

/**
 * This copies a component's `@context` and `@dynamicArgs` onto the component
 * itself, so a contextual component can reach them as plain properties. The
 * context lands under the camelized model name.
 */
class FuelReportModel extends Model {
    @attr('string') name;
}

module('Unit | Utility | apply-context-component-arguments', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('model:fuel-report', FuelReportModel);
        this.store = this.owner.lookup('service:store');
        this.component = (args) => ({ args });
    });

    test('a model context lands under its camelized model name', function (assert) {
        const context = this.store.createRecord('fuel-report', {});
        const component = this.component({ context });

        applyContextComponentArguments(component);

        assert.strictEqual(component.fuelReport, context);
    });

    test('a context that is not a model is ignored', function (assert) {
        const component = this.component({ context: { plain: 'object' } });

        applyContextComponentArguments(component);

        assert.deepEqual(Object.keys(component), ['args'], 'nothing is copied across');
    });

    test('no context at all is fine', function (assert) {
        const component = this.component({});

        applyContextComponentArguments(component);

        assert.deepEqual(Object.keys(component), ['args']);
    });

    test('dynamic arguments are copied onto the component', function (assert) {
        const component = this.component({ dynamicArgs: { title: 'Fuel', count: 2 } });

        applyContextComponentArguments(component);

        assert.strictEqual(component.title, 'Fuel');
        assert.strictEqual(component.count, 2);
    });

    test('the apply callback receives the component and is not copied across', function (assert) {
        const seen = [];
        const component = this.component({ dynamicArgs: { applyCallback: (c) => seen.push(c), title: 'Fuel' } });

        applyContextComponentArguments(component);

        assert.deepEqual(seen, [component], 'the callback is invoked with the component');
        assert.strictEqual(component.applyCallback, undefined, 'the callback itself is not applied as an argument');
        assert.strictEqual(component.title, 'Fuel', 'the other arguments still land');
    });

    test('the callback runs before the arguments are applied', function (assert) {
        const observed = [];
        const component = this.component({
            dynamicArgs: {
                applyCallback: (c) => observed.push(c.title),
                title: 'Fuel',
            },
        });

        applyContextComponentArguments(component);

        assert.deepEqual(observed, [undefined], 'the callback sees the component before dynamic args land');
    });

    test('a non-function apply callback is skipped rather than called', function (assert) {
        const component = this.component({ dynamicArgs: { applyCallback: 'not a function' } });

        applyContextComponentArguments(component);

        assert.strictEqual(component.applyCallback, undefined, 'it is still filtered out of the copied arguments');
    });

    test('context and dynamic arguments are applied together', function (assert) {
        const context = this.store.createRecord('fuel-report', {});
        const component = this.component({ context, dynamicArgs: { title: 'Fuel' } });

        applyContextComponentArguments(component);

        assert.strictEqual(component.fuelReport, context);
        assert.strictEqual(component.title, 'Fuel');
    });

    test('dynamic arguments may overwrite the context property', function (assert) {
        const context = this.store.createRecord('fuel-report', {});
        const component = this.component({ context, dynamicArgs: { fuelReport: 'replaced' } });

        applyContextComponentArguments(component);

        assert.strictEqual(component.fuelReport, 'replaced', 'dynamic args are applied last and win');
    });
});

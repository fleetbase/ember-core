import setComponentArg from 'dummy/utils/set-component-arg';
import { module, test } from 'qunit';
import EmberObject from '@ember/object';

module('Unit | Utility | set-component-arg', function () {
    test('it sets the property and returns the component', function (assert) {
        const component = EmberObject.create({ label: 'before' });

        const returned = setComponentArg(component, 'label', 'after');

        assert.strictEqual(component.label, 'after');
        assert.strictEqual(returned, component, 'the component is returned for chaining');
    });

    test('it leaves the property untouched when the value is undefined', function (assert) {
        const component = EmberObject.create({ label: 'keep me' });

        setComponentArg(component, 'label', undefined);

        assert.strictEqual(component.label, 'keep me');
    });

    test('it sets falsy values that are not undefined', function (assert) {
        const component = EmberObject.create({ count: 5, flag: true, name: 'x' });

        setComponentArg(component, 'count', 0);
        setComponentArg(component, 'flag', false);
        setComponentArg(component, 'name', null);

        assert.strictEqual(component.count, 0);
        assert.false(component.flag);
        assert.strictEqual(component.name, null);
    });
});

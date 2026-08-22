import registerComponent from 'dummy/utils/register-component';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Component from '@glimmer/component';

module('Unit | Utility | register-component', function (hooks) {
    setupTest(hooks);

    test('it derives the registration name from the class name', function (assert) {
        class MyWidgetComponent extends Component {}

        registerComponent(this.owner, MyWidgetComponent);

        assert.true(this.owner.hasRegistration('component:my-widget'), 'the -component suffix is dropped and the name dasherized');
    });

    test('it honours an explicit name', function (assert) {
        class SomeClass extends Component {}

        registerComponent(this.owner, SomeClass, { as: 'custom-name' });

        assert.true(this.owner.hasRegistration('component:custom-name'));
        assert.false(this.owner.hasRegistration('component:some-class'), 'the derived name is not also registered');
    });

    test('it does not overwrite an existing registration', function (assert) {
        class FirstComponent extends Component {}
        class SecondComponent extends Component {}

        registerComponent(this.owner, FirstComponent, { as: 'shared' });
        registerComponent(this.owner, SecondComponent, { as: 'shared' });

        assert.strictEqual(this.owner.resolveRegistration('component:shared'), FirstComponent, 'the first registration wins');
    });

    test('it is safe to call repeatedly', function (assert) {
        class RepeatComponent extends Component {}

        registerComponent(this.owner, RepeatComponent);
        registerComponent(this.owner, RepeatComponent);

        assert.true(this.owner.hasRegistration('component:repeat'));
    });
});

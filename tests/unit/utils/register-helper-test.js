import registerHelper from 'dummy/utils/register-helper';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { helper } from '@ember/component/helper';

module('Unit | Utility | register-helper', function (hooks) {
    setupTest(hooks);

    test('it registers a helper under a dasherized name', function (assert) {
        const shout = helper(([value]) => String(value).toUpperCase());

        registerHelper(this.owner, 'shoutLoudly', shout);

        assert.true(this.owner.hasRegistration('helper:shout-loudly'));
        assert.strictEqual(this.owner.resolveRegistration('helper:shout-loudly'), shout);
    });

    test('it leaves an already dasherized name alone', function (assert) {
        const noop = helper(() => null);

        registerHelper(this.owner, 'already-dashed', noop);

        assert.true(this.owner.hasRegistration('helper:already-dashed'));
    });

    test('it does not overwrite an existing helper', function (assert) {
        const first = helper(() => 'first');
        const second = helper(() => 'second');

        registerHelper(this.owner, 'greeting', first);
        registerHelper(this.owner, 'greeting', second);

        assert.strictEqual(this.owner.resolveRegistration('helper:greeting'), first);
    });
});

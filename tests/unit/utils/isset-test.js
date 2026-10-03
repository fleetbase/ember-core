import isset from 'dummy/utils/isset';
import { module, test } from 'qunit';

module('Unit | Utility | isset', function () {
    test('without a key it checks the target itself for blankness', function (assert) {
        assert.true(isset('value'));
        assert.true(isset(0));
        assert.true(isset({ a: 1 }));
        assert.false(isset(null));
        assert.false(isset(undefined));
        assert.false(isset(''));
        assert.false(isset('   '));
    });

    test('with a key it checks the resolved property', function (assert) {
        const target = { name: 'Fleet', empty: '', nested: { deep: 'yes' } };

        assert.true(isset(target, 'name'));
        assert.true(isset(target, 'nested.deep'));
        assert.false(isset(target, 'empty'));
        assert.false(isset(target, 'missing'));
        assert.false(isset(target, 'nested.missing'));
    });
});

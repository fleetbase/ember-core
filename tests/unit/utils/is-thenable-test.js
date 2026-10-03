import isThenable from 'dummy/utils/is-thenable';
import { module, test } from 'qunit';

module('Unit | Utility | is-thenable', function () {
    test('it is truthy for promises and thenables', function (assert) {
        assert.true(Boolean(isThenable(Promise.resolve())));
        assert.true(Boolean(isThenable({ then: () => {} })));
    });

    test('it is falsy for non-thenables', function (assert) {
        assert.false(Boolean(isThenable({})));
        assert.false(Boolean(isThenable({ then: 'not a function' })));
        assert.false(Boolean(isThenable([])));
        assert.false(Boolean(isThenable('string')));
    });

    test('it short-circuits falsy subjects to the subject itself', function (assert) {
        assert.strictEqual(isThenable(null), null);
        assert.strictEqual(isThenable(undefined), undefined);
        assert.strictEqual(isThenable(0), 0);
    });
});

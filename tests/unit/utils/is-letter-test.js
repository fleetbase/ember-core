import isLetter from 'dummy/utils/is-letter';
import { module, test } from 'qunit';

module('Unit | Utility | is-letter', function () {
    test('it is truthy for single ascii letters', function (assert) {
        assert.true(Boolean(isLetter('a')));
        assert.true(Boolean(isLetter('Z')));
    });

    test('it is falsy for non-letter or multi-character strings', function (assert) {
        assert.false(Boolean(isLetter('ab')));
        assert.false(Boolean(isLetter('1')));
        assert.false(Boolean(isLetter('!')));
        assert.false(Boolean(isLetter('')));
    });

    test('it is falsy for values without a usable length', function (assert) {
        assert.false(Boolean(isLetter(5)));
        assert.false(Boolean(isLetter(true)));
    });
});

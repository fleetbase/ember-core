import hasJsonStructure from 'dummy/utils/has-json-structure';
import { module, test } from 'qunit';

module('Unit | Utility | has-json-structure', function () {
    test('it accepts json objects and arrays', function (assert) {
        assert.true(hasJsonStructure('{}'));
        assert.true(hasJsonStructure('{"a":1}'));
        assert.true(hasJsonStructure('[]'));
        assert.true(hasJsonStructure('[1,2,3]'));
    });

    test('it rejects json scalars', function (assert) {
        assert.false(hasJsonStructure('"string"'));
        assert.false(hasJsonStructure('42'));
        assert.false(hasJsonStructure('true'));
        assert.false(hasJsonStructure('null'));
    });

    test('it rejects malformed json', function (assert) {
        assert.false(hasJsonStructure('{a:1}'));
        assert.false(hasJsonStructure('not json'));
        assert.false(hasJsonStructure(''));
    });

    test('it rejects non-strings', function (assert) {
        assert.false(hasJsonStructure({ a: 1 }));
        assert.false(hasJsonStructure([1]));
        assert.false(hasJsonStructure(null));
        assert.false(hasJsonStructure(undefined));
    });
});

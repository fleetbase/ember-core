import isJson from '@fleetbase/ember-core/utils/is-json';
import { module, test } from 'qunit';

module('Unit | Utility | is-json', function () {
    test('it accepts any valid json including scalars', function (assert) {
        assert.true(isJson('{}'));
        assert.true(isJson('{"a":1}'));
        assert.true(isJson('[1,2]'));
        assert.true(isJson('"a string"'));
        assert.true(isJson('42'));
        assert.true(isJson('true'));
        assert.true(isJson('null'));
    });

    test('it rejects malformed json', function (assert) {
        assert.false(isJson('{a:1}'));
        assert.false(isJson('not json'));
        assert.false(isJson(''));
        assert.false(isJson('{'));
    });

    test('it rejects non-strings', function (assert) {
        assert.false(isJson({ a: 1 }));
        assert.false(isJson(null));
        assert.false(isJson(undefined));
        assert.false(isJson(42));
    });
});

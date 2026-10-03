import hasonStructure from 'dummy/utils/hason-structure';
import hasJsonStructure from '@fleetbase/ember-core/utils/has-json-structure';
import { module, test } from 'qunit';

// A misspelt duplicate of has-json-structure, kept as an alias so existing imports keep working.
module('Unit | Utility | hason-structure', function () {
    test('it is has-json-structure', function (assert) {
        assert.strictEqual(hasonStructure, hasJsonStructure);
        assert.true(hasonStructure('{"a":1}'));
        assert.false(hasonStructure('not json'));
        assert.false(hasonStructure());
    });
});

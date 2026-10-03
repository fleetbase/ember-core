import ison from 'dummy/utils/ison';
import isJson from '@fleetbase/ember-core/utils/is-json';
import { module, test } from 'qunit';

// A misspelt duplicate of is-json, kept as an alias so existing imports keep working.
module('Unit | Utility | ison', function () {
    test('it is is-json', function (assert) {
        assert.strictEqual(ison, isJson);
        assert.true(ison('{}'));
        assert.false(ison('{'));
        assert.false(ison(null));
    });
});

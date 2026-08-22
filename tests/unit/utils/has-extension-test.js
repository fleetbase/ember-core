import hasExtension from 'dummy/utils/has-extension';
import { module, test } from 'qunit';

module('Unit | Utility | has-extension', function () {
    test('it reports true for a module the loader can resolve', function (assert) {
        assert.true(hasExtension('@fleetbase/ember-core/utils/is-email'));
    });

    test('it reports false for a module that is not present', function (assert) {
        assert.false(hasExtension('@fleetbase/definitely-not-installed'));
        assert.false(hasExtension('some/missing/module'));
    });

    test('it reports false rather than throwing for invalid input', function (assert) {
        assert.false(hasExtension(undefined));
        assert.false(hasExtension(null));
        assert.false(hasExtension(''));
    });
});

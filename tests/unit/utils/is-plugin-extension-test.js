import isPluginExtension from 'dummy/utils/is-plugin-extension';
import { module, test } from 'qunit';

module('Unit | Utility | is-plugin-extension', function () {
    test('detects plugin manifest shapes', function (assert) {
        assert.true(isPluginExtension({ type: 'plugin' }));
        assert.true(isPluginExtension({ fleetbase: { type: 'plugin' } }));
        assert.true(isPluginExtension({ fleetbase: { plugin: true } }));
        assert.false(isPluginExtension({ name: '@fleetbase/fleetops-engine' }));
        assert.false(isPluginExtension(null));
    });
});

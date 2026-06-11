import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

module('Unit | Service | universe/extension-manager', function (hooks) {
    setupTest(hooks);

    test('plugin manifests are registered without being treated as engines during setup', async function (assert) {
        const extensionManager = this.owner.lookup('service:universe/extension-manager');
        const universe = this.owner.lookup('service:universe');
        const application = this.owner.application;

        application.extensions = [
            {
                name: '@fleetbase/partner-plugin',
                type: 'plugin',
                main: 'fleetbase.plugin.js',
            },
            {
                name: '@fleetbase/fleetops-engine',
            },
        ];

        extensionManager.finishLoadingExtensions();

        await extensionManager.setupExtensions(this.owner, universe);

        assert.true(extensionManager.isExtensionInstalled('@fleetbase/partner-plugin'));
        assert.true(extensionManager.isExtensionInstalled('@fleetbase/fleetops-engine'));
    });
});

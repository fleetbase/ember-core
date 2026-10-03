import ExtensionBootState from '@fleetbase/ember-core/contracts/extension-boot-state';
import HookRegistry from '@fleetbase/ember-core/contracts/hook-registry';
import { module, test } from 'qunit';

// Shared singletons registered on the application container. They hold state and
// no behaviour, so what matters is their initial shape and that each instance gets
// its own containers rather than sharing class-level ones.
//
// UniverseRegistry is deliberately absent: it imports tracked-built-ins, which was
// an undeclared dependency. It is now declared, but the module still does not
// resolve in the build, which is also why contracts/universe-registry.js and
// services/universe/registry-service.js never appear in the coverage report.
module('Unit | Contract | shared state containers', function () {
    module('ExtensionBootState', function () {
        test('it starts in the booting state with nothing loaded', function (assert) {
            const state = new ExtensionBootState();

            assert.true(state.isBooting);
            assert.false(state.extensionsLoaded);
            assert.strictEqual(state.bootPromise, null);
            assert.strictEqual(state.extensionsLoadedPromise, null);
            assert.strictEqual(state.extensionsLoadedResolver, null);
        });

        test('it exposes empty engine and promise containers', function (assert) {
            const state = new ExtensionBootState();

            assert.strictEqual(state.loadedEngines.size, 0);
            assert.strictEqual(state.loadingPromises.size, 0);
            assert.strictEqual(state.engineLoadedHooks.size, 0);
            assert.strictEqual(state.registeredExtensions.length, 0);
        });

        test('each instance owns its containers', function (assert) {
            const first = new ExtensionBootState();
            const second = new ExtensionBootState();

            first.loadedEngines.set('a', {});
            first.registeredExtensions.pushObject('a');

            assert.strictEqual(second.loadedEngines.size, 0, 'maps are not shared between instances');
            assert.strictEqual(second.registeredExtensions.length, 0, 'arrays are not shared between instances');
        });

        test('its state can be advanced as booting completes', function (assert) {
            const state = new ExtensionBootState();

            state.isBooting = false;
            state.extensionsLoaded = true;
            state.loadedEngines.set('@fleetbase/fleetops-engine', { name: 'fleetops' });

            assert.false(state.isBooting);
            assert.true(state.extensionsLoaded);
            assert.strictEqual(state.loadedEngines.get('@fleetbase/fleetops-engine').name, 'fleetops');
        });
    });

    module('HookRegistry', function () {
        test('it starts with no hooks', function (assert) {
            assert.deepEqual(new HookRegistry().hooks, {});
        });

        test('each instance owns its hook map', function (assert) {
            const first = new HookRegistry();
            const second = new HookRegistry();

            first.hooks = { boot: [() => {}] };

            assert.deepEqual(second.hooks, {});
        });
    });
});

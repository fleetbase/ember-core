import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * ExtensionManager tracks which engines are loaded and coordinates the two
 * phases of startup — extensions arriving from the API, then boot completing.
 *
 * Like the hook service its state is an application-level singleton, so each
 * test supplies its own stand-in application through `universe.applicationInstance`
 * to keep the phases from leaking between tests.
 *
 * Engine construction itself is not exercised here: it needs a real engine in
 * the container, which is an application-level concern rather than a unit one.
 */
function fakeApplication() {
    const registrations = new Map();
    return {
        hasRegistration: (key) => registrations.has(key),
        register: (key, value) => registrations.set(key, value),
        resolveRegistration: (key) => registrations.get(key),
    };
}

module('Unit | Service | universe/extension-manager', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.application = fakeApplication();
        const testContext = this;

        this.owner.register(
            'service:universe',
            class extends Service {
                get applicationInstance() {
                    return testContext.application;
                }
            }
        );

        this.service = this.owner.lookup('service:universe/extension-manager');
    });

    module('extension registration', function () {
        test('an extension is registered with its metadata', function (assert) {
            this.service.registerExtension('@fleetbase/fleetops-engine', { version: '1.0.0' });

            assert.deepEqual(this.service.getExtension('@fleetbase/fleetops-engine'), {
                name: '@fleetbase/fleetops-engine',
                version: '1.0.0',
            });
        });

        test('metadata is required to be optional', function (assert) {
            this.service.registerExtension('@fleetbase/fleetops-engine');

            assert.deepEqual(this.service.getExtension('@fleetbase/fleetops-engine'), { name: '@fleetbase/fleetops-engine' });
        });

        test('re-registering merges into the existing record rather than adding one', function (assert) {
            this.service.registerExtension('ext', { version: '1.0.0', keep: true });
            this.service.registerExtension('ext', { version: '2.0.0' });

            assert.strictEqual(this.service.getExtensions().length, 1);
            assert.deepEqual(this.service.getExtension('ext'), { name: 'ext', version: '2.0.0', keep: true }, 'earlier keys survive');
        });

        test('several extensions are kept in registration order', function (assert) {
            this.service.registerExtension('a');
            this.service.registerExtension('b');

            assert.deepEqual(
                this.service.getExtensions().map((e) => e.name),
                ['a', 'b']
            );
        });

        test('an unknown extension is null', function (assert) {
            assert.strictEqual(this.service.getExtension('nope'), null);
        });

        test('installation checks agree with what was registered', function (assert) {
            this.service.registerExtension('ext');

            assert.true(this.service.isExtensionInstalled('ext'));
            assert.false(this.service.isExtensionInstalled('nope'));
        });

        test('the installation aliases all report the same thing', function (assert) {
            this.service.registerExtension('ext');

            assert.true(this.service.isEngineInstalled('ext'));
            assert.true(this.service.hasExtensionIndexed('ext'));
            assert.true(this.service.isInstalled('ext'));
            assert.true(this.service.isExtensionSetup('ext'));
            assert.true(this.service.hasExtensionSetup('ext'));
        });
    });

    module('loaded engines', function () {
        test('an engine that was never loaded is absent', function (assert) {
            assert.strictEqual(this.service.getEngineInstance('nope'), null);
            assert.false(this.service.isEngineLoaded('nope'));
            assert.false(this.service.isEngineLoading('nope'));
        });

        test('a loaded engine is reported and returned', function (assert) {
            const instance = {};
            this.service.loadedEngines.set('engine', instance);

            assert.true(this.service.isEngineLoaded('engine'));
            assert.strictEqual(this.service.getEngineInstance('engine'), instance);
        });

        test('unloading destroys the instance and forgets it', function (assert) {
            let destroyed = 0;
            this.service.loadedEngines.set('engine', { destroy: () => (destroyed += 1) });

            this.service.unloadEngine('engine');

            assert.strictEqual(destroyed, 1);
            assert.false(this.service.isEngineLoaded('engine'));
        });

        test('an instance with no destroy method is still forgotten', function (assert) {
            this.service.loadedEngines.set('engine', {});

            this.service.unloadEngine('engine');

            assert.false(this.service.isEngineLoaded('engine'));
        });

        test('unloading an engine that was never loaded is harmless', function (assert) {
            this.service.unloadEngine('nope');

            assert.strictEqual(this.service.loadedEngines.size, 0);
        });

        test('mount points come from the engine configuration', function (assert) {
            this.service.loadedEngines.set('engine', {
                resolveRegistration: () => ({ modulePrefix: '@fleetbase/fleet-ops-engine', mountedEngineRoutePrefix: 'console.fleet-ops' }),
            });

            assert.strictEqual(this.service.getEngineMountPoint('engine'), 'console.fleet-ops.', 'a trailing dot is added');
        });

        test('an existing trailing dot is not doubled', function (assert) {
            this.service.loadedEngines.set('engine', {
                resolveRegistration: () => ({ modulePrefix: 'x', mountedEngineRoutePrefix: 'console.fleet-ops.' }),
            });

            assert.strictEqual(this.service.getEngineMountPoint('engine'), 'console.fleet-ops.');
        });

        test('a missing route prefix is derived from the module prefix', function (assert) {
            this.service.loadedEngines.set('engine', {
                resolveRegistration: () => ({ modulePrefix: '@fleetbase/fleet-ops-engine' }),
            });

            assert.strictEqual(this.service.getEngineMountPoint('engine'), 'console.fleet-ops.', 'the scope and the -engine suffix are stripped');
        });

        test('an unscoped module prefix still derives a mount point', function (assert) {
            this.service.loadedEngines.set('engine', {
                resolveRegistration: () => ({ modulePrefix: 'storefront-engine' }),
            });

            assert.strictEqual(this.service.getEngineMountPoint('engine'), 'console.storefront.');
        });

        test('an unknown engine or missing config has no mount point', function (assert) {
            assert.strictEqual(this.service.getEngineMountPoint('nope'), null);

            this.service.loadedEngines.set('engine', { resolveRegistration: () => null });
            assert.strictEqual(this.service.getEngineMountPoint('engine'), null);
        });
    });

    module('extensions-loaded phase', function () {
        test('it starts unloaded', function (assert) {
            assert.false(this.service.extensionsLoaded);
        });

        test('finishing marks it loaded and resolves the wait', async function (assert) {
            const waiting = this.service.waitForExtensionsLoaded();

            this.service.finishLoadingExtensions();

            await waiting;
            assert.true(this.service.extensionsLoaded);
        });

        test('waiting after the fact resolves immediately', async function (assert) {
            this.service.finishLoadingExtensions();

            await this.service.waitForExtensionsLoaded();

            assert.true(true, 'the wait resolved');
        });

        test('finishing twice is harmless', function (assert) {
            this.service.finishLoadingExtensions();
            this.service.finishLoadingExtensions();

            assert.strictEqual(this.service.extensionsLoadedResolver, null, 'the resolver is cleared after the first call');
        });
    });

    module('boot phase', function () {
        test('it starts booting', function (assert) {
            assert.true(this.service.isBooting);
        });

        test('waiting resolves once boot finishes', async function (assert) {
            const waiting = this.service.waitForBoot();

            this.service.finishBoot();

            await waiting;
            assert.false(this.service.isBooting);
        });

        test('waiting after boot resolves immediately', async function (assert) {
            this.service.finishBoot();

            await this.service.waitForBoot();

            assert.true(true, 'the wait resolved');
        });

        test('several waiters all resolve', async function (assert) {
            const first = this.service.waitForBoot();
            const second = this.service.waitForBoot();

            this.service.finishBoot();

            await Promise.all([first, second]);
            assert.true(true, 'both resolved');
        });

        test('finishing twice is harmless', function (assert) {
            this.service.waitForBoot();
            this.service.finishBoot();
            this.service.finishBoot();

            assert.strictEqual(this.service.bootPromise, null);
        });

        test('finishing with nobody waiting is harmless', function (assert) {
            this.service.finishBoot();

            assert.false(this.service.isBooting);
        });
    });

    module('shared state', function () {
        test('a second instance sees the same boot state', function (assert) {
            this.service.registerExtension('ext');
            this.service.finishBoot();

            this.owner.register('service:second-manager', this.service.constructor);
            const second = this.owner.lookup('service:second-manager');

            assert.false(second.isBooting, 'the phase is shared');
            assert.deepEqual(
                second.getExtensions().map((e) => e.name),
                ['ext'],
                'and so is the extension list'
            );
        });

        test('setApplicationInstance records the application', function (assert) {
            const application = fakeApplication();

            this.service.setApplicationInstance(application);

            assert.strictEqual(this.service.applicationInstance, application);
        });
    });
});

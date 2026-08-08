import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * Engine loading, which this campaign wrote off for a long time as needing a real
 * engine in the container. It does not.
 *
 * #loadEngine drives the router's PRIVATE engine API — `_enginePromises`,
 * `_engineIsLoaded`, `_assetLoader.loadBundle`, `_registerEngine` — and
 * constructEngineInstance only calls `hasRegistration`, `buildChildEngineInstance`
 * and `engineInstance.boot()`. Every one of those is reachable through a fake
 * application handed to the service before it is built, which is what this file
 * does. No engine bundle is loaded and nothing touches the network.
 *
 * The application has to be in place BEFORE construction: the constructor calls
 * #initializeBootState, which calls #getApplication. That is why each test builds
 * its own service with factoryFor().create() after registering the universe stub.
 */
function fakeEngineInstance(name, environment) {
    return {
        name,
        booted: 0,
        destroyed: 0,
        registrations: [],
        // The owner patch calls this on every instance it builds, to read the
        // engine's mount prefix out of its own config.
        resolveRegistration(key) {
            return key === 'config:environment' ? environment : undefined;
        },
        boot() {
            this.booted += 1;
            return Promise.resolve(this);
        },
        destroy() {
            this.destroyed += 1;
        },
        register(fullName, factory, options) {
            this.registrations.push({ fullName, factory, options });
        },
        hasRegistration() {
            return false;
        },
        lookup() {
            return undefined;
        },
    };
}

function fakeApplication({ loadedBundles = [], environmentFor = (name) => ({ modulePrefix: name }) } = {}) {
    const registrations = new Map();
    const built = [];
    const router = {
        _enginePromises: Object.create(null),
        _engineInstances: null,
        loadedBundles: [...loadedBundles],
        registeredEngines: [],
        bundleRequests: [],
        bundleRejects: false,
        _engineIsLoaded(name) {
            return this.loadedBundles.includes(name);
        },
        _registerEngine(name) {
            this.registeredEngines.push(name);
        },
        _assetLoader: {
            loadBundle(name) {
                router.bundleRequests.push(name);
                return router.bundleRejects ? Promise.reject(new Error(`no bundle for ${name}`)) : Promise.resolve();
            },
        },
    };

    return {
        router,
        built,
        registrations,
        lookup(fullName) {
            return fullName === 'router:main' ? router : undefined;
        },
        hasRegistration(key) {
            return registrations.has(key);
        },
        register(key, value) {
            registrations.set(key, value);
        },
        resolveRegistration(key) {
            return registrations.get(key);
        },
        buildChildEngineInstance(name, options) {
            const instance = fakeEngineInstance(name, environmentFor(name));
            built.push({ name, options, instance });
            return instance;
        },
    };
}

module('Unit | Service | universe/extension-manager (engine loading)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.application = fakeApplication();
        // Every engine name asked for is considered registered unless a test
        // says otherwise; the assert in constructEngineInstance checks this.
        this.application.hasRegistration = (key) => (key.startsWith('engine:') ? !this.unregisteredEngines?.includes(key.slice(7)) : this.application.registrations.has(key));

        const testContext = this;
        this.owner.register(
            'service:universe',
            class extends Service {
                get applicationInstance() {
                    return testContext.application;
                }
            }
        );

        // A test that needs a differently-configured application swaps it in and
        // rebuilds, since the constructor reads the application immediately.
        this.applyApplication = () => {
            this.application.hasRegistration = (key) => (key.startsWith('engine:') ? true : this.application.registrations.has(key));
            this.service = this.build();
            this.router = this.application.router;
        };

        this.build = () => this.owner.factoryFor('service:universe/extension-manager').create();
        this.service = this.build();
        this.router = this.application.router;
    });

    module('mount points', function () {
        test('an engine that is not loaded has no mount point', function (assert) {
            // getEngineMountPoint reads the LOADED instance's own
            // config:environment — it does not derive anything from the name.
            assert.strictEqual(this.service.getEngineMountPoint('@fleetbase/fleetops-engine'), null);
        });

        test('it is derived from the engine module prefix, with a trailing dot', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(this.service.getEngineMountPoint('@fleetbase/fleetops-engine'), 'console.fleetops.');
        });

        test('an unscoped module prefix is handled too', async function (assert) {
            await this.service.ensureEngineLoaded('storefront-engine');

            assert.strictEqual(this.service.getEngineMountPoint('storefront-engine'), 'console.storefront.');
        });

        test('a config that names its own route prefix wins', async function (assert) {
            this.application = fakeApplication({ environmentFor: () => ({ modulePrefix: '@fleetbase/fleetops-engine', mountedEngineRoutePrefix: 'ops' }) });
            this.applyApplication();
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(this.service.getEngineMountPoint('@fleetbase/fleetops-engine'), 'ops.');
        });

        test('a prefix that already ends in a dot is left alone', async function (assert) {
            this.application = fakeApplication({ environmentFor: () => ({ modulePrefix: 'x', mountedEngineRoutePrefix: 'ops.' }) });
            this.applyApplication();
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(this.service.getEngineMountPoint('@fleetbase/fleetops-engine'), 'ops.');
        });

        test('an instance with no config at all has no mount point', async function (assert) {
            this.application = fakeApplication({ environmentFor: () => undefined });
            this.applyApplication();
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(this.service.getEngineMountPoint('@fleetbase/fleetops-engine'), null);
        });
    });

    module('loading an engine', function () {
        test('it loads the bundle, registers the engine and boots the instance', async function (assert) {
            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(this.router.bundleRequests, ['@fleetbase/fleetops-engine'], 'the bundle was requested');
            assert.deepEqual(this.router.registeredEngines, ['@fleetbase/fleetops-engine']);
            assert.strictEqual(instance.booted, 1);
        });

        test('the instance is built for the derived mount point', async function (assert) {
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(this.application.built[0].options, { routable: true, mountPoint: 'console.fleetops' });
        });

        test('an engine whose bundle is already loaded skips the asset loader', async function (assert) {
            this.router.loadedBundles.push('@fleetbase/fleetops-engine');

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.deepEqual(this.router.bundleRequests, [], 'no bundle request');
            assert.strictEqual(instance.booted, 1, 'but it is still constructed and booted');
        });

        test('a second request returns the cached instance without rebuilding', async function (assert) {
            const first = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            const second = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(second, first);
            assert.strictEqual(this.application.built.length, 1);
        });

        test('two concurrent requests share one loading promise', async function (assert) {
            const [first, second] = await Promise.all([this.service.ensureEngineLoaded('@fleetbase/fleetops-engine'), this.service.ensureEngineLoaded('@fleetbase/fleetops-engine')]);

            assert.strictEqual(second, first);
            assert.strictEqual(this.application.built.length, 1, 'the engine is built once');
        });

        test('a failed bundle load rejects and is not cached', async function (assert) {
            this.router.bundleRejects = true;

            await assert.rejects(this.service.ensureEngineLoaded('@fleetbase/fleetops-engine'), /no bundle/);

            assert.false(this.service.isEngineLoading('@fleetbase/fleetops-engine'), 'the loading promise is cleared');
            assert.false(this.service.isEngineLoaded('@fleetbase/fleetops-engine'));
        });

        test('loadEngine is a public alias for the same work', async function (assert) {
            const instance = await this.service.loadEngine('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.name, '@fleetbase/fleetops-engine');
        });
    });

    module('tracking what is loaded', function () {
        test('getEngineInstance returns the instance once loaded, null before', async function (assert) {
            assert.strictEqual(this.service.getEngineInstance('@fleetbase/fleetops-engine'), null);

            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.strictEqual(this.service.getEngineInstance('@fleetbase/fleetops-engine'), instance);
        });

        test('isEngineLoaded follows the same lifecycle', async function (assert) {
            assert.false(this.service.isEngineLoaded('@fleetbase/fleetops-engine'));

            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            assert.true(this.service.isEngineLoaded('@fleetbase/fleetops-engine'));
        });

        test('unloadEngine destroys the instance and forgets it', async function (assert) {
            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            this.service.unloadEngine('@fleetbase/fleetops-engine');

            assert.strictEqual(instance.destroyed, 1);
            assert.false(this.service.isEngineLoaded('@fleetbase/fleetops-engine'));
        });

        test('unloading an engine that was never loaded is harmless', function (assert) {
            this.service.unloadEngine('@fleetbase/nope');

            assert.false(this.service.isEngineLoaded('@fleetbase/nope'));
        });

        test('preloadEngines loads each one', async function (assert) {
            const instances = await this.service.preloadEngines(['@fleetbase/fleetops-engine', '@fleetbase/storefront-engine']);

            assert.deepEqual(
                instances.map((i) => i.name),
                ['@fleetbase/fleetops-engine', '@fleetbase/storefront-engine']
            );
        });
    });

    module('registering into engines', function () {
        test('a service is registered into a loaded engine', async function (assert) {
            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            class DispatchService extends Service {}

            const registered = this.service.registerServiceIntoEngine('@fleetbase/fleetops-engine', 'dispatch', DispatchService);

            assert.true(registered);
            assert.deepEqual(
                instance.registrations.map((r) => r.fullName),
                ['service:dispatch']
            );
        });

        test('registering into an engine that is not loaded reports false', function (assert) {
            class DispatchService extends Service {}

            assert.false(this.service.registerServiceIntoEngine('@fleetbase/nope', 'dispatch', DispatchService));
            assert.false(this.service.registerComponentIntoEngine('@fleetbase/nope', 'order-card', class {}));
        });

        test('a component is registered into a loaded engine', async function (assert) {
            const instance = await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');
            class OrderCard {}

            const registered = this.service.registerComponentIntoEngine('@fleetbase/fleetops-engine', 'order-card', OrderCard);

            assert.true(registered);
            assert.deepEqual(
                instance.registrations.map((r) => r.fullName),
                ['component:order-card']
            );
        });
    });

    module('extension bookkeeping', function () {
        test('registering an extension records it', function (assert) {
            this.service.registerExtension('@fleetbase/fleetops-engine', { version: '1.0.0' });

            assert.strictEqual(this.service.getExtension('@fleetbase/fleetops-engine').version, '1.0.0');
            assert.true(this.service.isExtensionInstalled('@fleetbase/fleetops-engine'));
        });

        test('registering the same extension again merges the metadata', function (assert) {
            this.service.registerExtension('@fleetbase/fleetops-engine', { version: '1.0.0' });
            this.service.registerExtension('@fleetbase/fleetops-engine', { version: '2.0.0', author: 'Fleetbase' });

            const extension = this.service.getExtension('@fleetbase/fleetops-engine');
            assert.strictEqual(extension.version, '2.0.0');
            assert.strictEqual(extension.author, 'Fleetbase');
            assert.strictEqual(this.service.getExtensions().filter((e) => e.name === '@fleetbase/fleetops-engine').length, 1, 'not duplicated');
        });

        test('metadata is optional', function (assert) {
            this.service.registerExtension('@fleetbase/bare-engine');

            assert.strictEqual(this.service.getExtension('@fleetbase/bare-engine').name, '@fleetbase/bare-engine');
        });

        test('an unregistered extension reports as absent', function (assert) {
            assert.strictEqual(this.service.getExtension('@fleetbase/nope'), null);
            assert.false(this.service.isExtensionInstalled('@fleetbase/nope'));
        });

        test('the four installed-check aliases agree', function (assert) {
            this.service.registerExtension('@fleetbase/fleetops-engine');

            assert.true(this.service.isEngineInstalled('@fleetbase/fleetops-engine'));
            assert.true(this.service.hasExtensionIndexed('@fleetbase/fleetops-engine'));
            assert.true(this.service.isInstalled('@fleetbase/fleetops-engine'));
            assert.true(this.service.isExtensionSetup('@fleetbase/fleetops-engine'));
            assert.true(this.service.hasExtensionSetup('@fleetbase/fleetops-engine'));
        });
    });

    module('the boot and extension gates', function () {
        test('waitForBoot resolves immediately when nothing is booting', async function (assert) {
            this.service.isBooting = false;

            assert.strictEqual(await this.service.waitForBoot(), undefined);
        });

        test('waitForBoot waits until finishBoot is called', async function (assert) {
            this.service.isBooting = true;
            let settled = false;

            const waiting = this.service.waitForBoot().then(() => (settled = true));
            assert.false(settled, 'still waiting');

            this.service.finishBoot();
            await waiting;

            assert.true(settled);
            assert.false(this.service.isBooting);
        });

        test('finishBoot with nothing waiting is harmless', function (assert) {
            this.service.finishBoot();

            assert.false(this.service.isBooting);
        });

        test('finishLoadingExtensions resolves whoever is waiting', async function (assert) {
            let settled = false;
            const waiting = this.service.waitForExtensionsLoaded().then(() => (settled = true));

            this.service.finishLoadingExtensions();
            await waiting;

            assert.true(settled);
            assert.true(this.service.extensionsLoaded);
        });

        test('finishLoadingExtensions twice is harmless', function (assert) {
            this.service.finishLoadingExtensions();
            this.service.finishLoadingExtensions();

            assert.true(this.service.extensionsLoaded);
        });
    });

    module('getStats', function () {
        test('it reports what has been loaded and registered', async function (assert) {
            this.service.registerExtension('@fleetbase/fleetops-engine');
            await this.service.ensureEngineLoaded('@fleetbase/fleetops-engine');

            const stats = this.service.getStats();

            assert.strictEqual(stats.loadedCount, 1);
            assert.strictEqual(stats.registeredCount, 1);
            assert.deepEqual(stats.loadedEngines, ['@fleetbase/fleetops-engine']);
            assert.deepEqual(stats.loadingEngines, [], 'nothing still in flight');
        });
    });
});

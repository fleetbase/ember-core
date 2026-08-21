import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';

/**
 * #getApplication's fallback chain, which every other extension-manager test
 * short-circuits at the first step by giving the universe stub an
 * applicationInstance.
 *
 * With the universe holding none, the search falls through to the second
 * priority (an instance set on the service itself) and then to the owner's
 * application — which in a test is the real Application, so the boot state is
 * registered there just as it would be in the app.
 */
module('Unit | Service | universe/extension-manager (finding the application)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        // No applicationInstance, so the first priority never matches.
        this.owner.register('service:universe', class extends Service {});

        this.application = this.owner.application;
        this.originalBuild = this.application.buildChildEngineInstance;
        this.originalPatched = this.application._buildChildEngineInstancePatched;
    });

    hooks.afterEach(function () {
        // The service patches buildChildEngineInstance on whatever application it
        // finds. That is the real Application here, which outlives the test, so
        // the wrapper is taken back off.
        this.application.buildChildEngineInstance = this.originalBuild;
        this.application._buildChildEngineInstancePatched = this.originalPatched;
    });

    test('it starts with no application instance of its own', function (assert) {
        const service = this.owner.factoryFor('service:universe/extension-manager').create();

        assert.strictEqual(service.applicationInstance, null, 'which is what makes the search fall through');
    });

    test('it falls through to the owner application', function (assert) {
        const service = this.owner.factoryFor('service:universe/extension-manager').create();

        assert.ok(service.bootState, 'the boot state resolved');
        assert.true(this.application.hasRegistration('state:extension-boot'), 'registered on the Application the owner points at');
    });

    test('an instance set on the service is preferred once one is set', async function (assert) {
        const service = this.owner.factoryFor('service:universe/extension-manager').create();

        const registrations = new Map();
        const router = {
            _enginePromises: Object.create(null),
            _engineInstances: null,
            _engineIsLoaded: () => true,
            _registerEngine: () => {},
            _assetLoader: { loadBundle: () => Promise.resolve() },
        };
        const own = {
            hasRegistration: (key) => (key.startsWith('engine:') ? true : registrations.has(key)),
            register: (key, value) => registrations.set(key, value),
            resolveRegistration: (key) => registrations.get(key),
            lookup: (fullName) => (fullName === 'router:main' ? router : undefined),
            buildChildEngineInstance: (name) => ({
                name,
                resolveRegistration: () => undefined,
                boot: () => Promise.resolve(),
                register: () => {},
            }),
        };

        service.setApplicationInstance(own);
        const instance = await service.ensureEngineLoaded('@fleetbase/fleetops-engine');

        assert.strictEqual(instance.name, '@fleetbase/fleetops-engine', 'the engine was built through the instance it was given');
    });
});

/**
 * The last resort in #getApplication: an owner with no `.application`, which is
 * what an EngineInstance looks like.
 *
 * `owner.application` is blanked around the CALL and RESTORED — an earlier
 * attempt deleted it and never put it back, and Ember's own
 * ApplicationInstance#willDestroy reads `this.application._unwatchInstance`
 * during teardown, which took the run down.
 */
module('Unit | Service | universe/extension-manager (an owner with no application)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe', class extends Service {});
    });

    test('the owner itself is used, and the boot state registered on it', function (assert) {
        const owner = this.owner;
        const realApplication = owner.application;
        let service;

        try {
            owner.application = undefined;
            service = owner.factoryFor('service:universe/extension-manager').create();
        } finally {
            owner.application = realApplication;
        }

        assert.ok(service.bootState, 'the search still produced something usable');
        assert.true(owner.hasRegistration('state:extension-boot'), 'registered on the owner rather than an application');
    });
});

/**
 * The hooks that #onEngineInstanceBuilt schedules on `next()`.
 *
 * In every ordinary ordering the boot patch clears the hooks first — boot
 * resolves as a microtask, `next()` is a runloop task. An engine whose boot
 * never resolves leaves them in place, which is the only way that scheduled
 * callback has anything to do.
 */
module('Unit | Service | universe/extension-manager (hooks scheduled after build)', function (hooks) {
    setupTest(hooks);

    test('a hook runs from the scheduled callback when boot has not settled', async function (assert) {
        const registrations = new Map();
        const router = {
            _enginePromises: Object.create(null),
            _engineInstances: null,
            _engineIsLoaded: () => true,
            _registerEngine: () => {},
            _assetLoader: { loadBundle: () => Promise.resolve() },
        };
        const universeStub = { name: 'universe service' };
        const application = {
            hasRegistration: (key) => (key.startsWith('engine:') ? true : registrations.has(key)),
            register: (key, value) => registrations.set(key, value),
            resolveRegistration: (key) => registrations.get(key),
            lookup: (fullName) => (fullName === 'router:main' ? router : fullName === 'service:universe' ? universeStub : undefined),
            buildChildEngineInstance: (name) => ({
                name,
                // Already patched, so the owner patch leaves boot alone and only
                // constructEngineInstance's own `.then` is waiting on it.
                _bootPatched: true,
                resolveRegistration: () => undefined,
                boot: () => new Promise(() => {}),
                register: () => {},
            }),
        };

        this.owner.register(
            'service:universe',
            class extends Service {
                get applicationInstance() {
                    return application;
                }
            }
        );

        const service = this.owner.factoryFor('service:universe/extension-manager').create();
        const calls = [];
        service.whenEngineLoaded('@fleetbase/fleetops-engine', (engine) => calls.push(engine.name));

        service.ensureEngineLoaded('@fleetbase/fleetops-engine');
        await settled();

        assert.deepEqual(calls, ['@fleetbase/fleetops-engine'], 'the scheduled callback found the hooks still there');
    });
});

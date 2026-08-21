import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

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

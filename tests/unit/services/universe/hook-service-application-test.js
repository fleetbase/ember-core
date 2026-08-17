import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { getOwner } from '@ember/application';

/**
 * The hook registry is stored on the application container so every engine
 * shares one, and finding that container has a four-step fallback.
 *
 * The search runs on FIRST USE of `hookRegistry`, not in the constructor, so
 * `setApplicationInstance` can land first and be honoured — that ordering is
 * what the fallback chain was written for. Each test builds its own service
 * with factoryFor().create() rather than taking the singleton, which would
 * carry the previous test's registry.
 */
function container(name) {
    const registrations = new Map();
    return {
        name,
        registrations,
        hasRegistration: (key) => registrations.has(key),
        register: (key, value) => registrations.set(key, value),
        resolveRegistration: (key) => registrations.get(key),
    };
}

module('Unit | Service | universe/hook-service (finding the application)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.build = () => this.owner.factoryFor('service:universe/hook-service').create();
    });

    test('the universe application instance is preferred', function (assert) {
        const preferred = container('universe');
        this.owner.register(
            'service:universe',
            class extends Service {
                applicationInstance = preferred;
            }
        );

        const service = this.build();

        assert.ok(service.hookRegistry, 'resolving the registry');
        assert.true(preferred.registrations.has('registry:hooks'), 'the registry went to the universe instance');
    });

    test('its own applicationInstance is used when set before first use', function (assert) {
        // #getApplication lists `this.applicationInstance` second. That used to
        // be unreachable because the only caller ran in the constructor, before
        // setApplicationInstance could have been called. The registry now
        // resolves lazily, so an instance set first is honoured.
        this.owner.register('service:universe', class extends Service {});
        const own = container('own');

        const service = this.build();
        service.setApplicationInstance(own);

        assert.ok(service.hookRegistry, 'resolving it now');
        assert.true(own.registrations.has('registry:hooks'), 'on the instance it was given');
    });

    test('the universe instance still outranks it', function (assert) {
        const preferred = container('universe');
        this.owner.register(
            'service:universe',
            class extends Service {
                applicationInstance = preferred;
            }
        );
        const own = container('own');

        const service = this.build();
        service.setApplicationInstance(own);

        assert.ok(service.hookRegistry);
        assert.true(preferred.registrations.has('registry:hooks'), 'first priority wins');
        assert.false(own.registrations.has('registry:hooks'));
    });

    test('the owner application is used when the universe has none', function (assert) {
        // This is the ordinary application path: getOwner returns the
        // ApplicationInstance and its `application` is the Application, which
        // owns the shared registry.
        //
        // `owner.application` is NOT safe to stand in for — Ember's own
        // ApplicationInstance#willDestroy reads `this.application._unwatchInstance`
        // during teardown, so replacing it breaks the run rather than the test.
        // The real one is asserted against instead.
        this.owner.register('service:universe', class extends Service {});

        const service = this.build();

        assert.strictEqual(getOwner(service), this.owner);
        assert.ok(this.owner.application, 'the test owner really does have one');
        assert.ok(service.hookRegistry, 'resolving the registry');
        assert.true(this.owner.application.hasRegistration('registry:hooks'), 'the registry lives on the Application');
    });

    test('the last resort is the owner itself, for an owner with no application', function (assert) {
        // An EngineInstance has no `application`, so #getApplication returns the
        // owner. That shape cannot be built here without breaking Ember's
        // teardown, so what is pinned is the reachable half: the registry is
        // resolvable through the owner either way, because an ApplicationInstance
        // shares its Application's registry.
        this.owner.register('service:universe', class extends Service {});

        const service = this.build();

        assert.true(this.owner.hasRegistration('registry:hooks'));
        assert.strictEqual(this.owner.resolveRegistration('registry:hooks'), service.hookRegistry);
    });

    test('a second service reuses the registry rather than replacing it', function (assert) {
        const preferred = container('universe');
        this.owner.register(
            'service:universe',
            class extends Service {
                applicationInstance = preferred;
            }
        );

        const first = this.build();
        const second = this.build();

        assert.strictEqual(second.hookRegistry, first.hookRegistry, 'which is what makes the registry shared across engines');
        assert.strictEqual(preferred.registrations.size, 1);
    });
});

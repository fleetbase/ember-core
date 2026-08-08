import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { getOwner } from '@ember/application';

/**
 * The hook registry is stored on the application container so every engine
 * shares one. Finding that container has a four-step fallback, and only the
 * first step was exercised — the rest are what an engine, or a service booted
 * before the application instance is set, actually hits.
 */
module('Unit | Service | universe/hook-service (finding the application)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe', class extends Service {});

        this.service = this.owner.lookup('service:universe/hook-service');
        this.universe = this.owner.lookup('service:universe');

        // A container stand-in that records what was registered on it. The
        // registry is only stored once, so each test asserts which object
        // received it.
        this.container = (name) => {
            const registrations = new Map();
            return {
                name,
                hasRegistration: (key) => registrations.has(key),
                register: (key, value) => registrations.set(key, value),
                resolveRegistration: (key) => registrations.get(key),
                registrations,
            };
        };
    });

    test('the universe application instance is preferred', function (assert) {
        const preferred = this.container('universe');
        this.universe.applicationInstance = preferred;
        this.service.setApplicationInstance(this.container('own'));

        this.service.registerHook('order:created', () => {});

        assert.true(preferred.registrations.has('registry:hooks'), 'the registry went to the universe instance');
    });

    test('its own application instance is used when the universe has none', function (assert) {
        const own = this.container('own');
        this.universe.applicationInstance = null;
        this.service.setApplicationInstance(own);

        this.service.registerHook('order:created', () => {});

        assert.true(own.registrations.has('registry:hooks'));
    });

    test('the owner application is used when neither is set', function (assert) {
        this.universe.applicationInstance = null;
        const application = this.container('owner-application');
        const owner = getOwner(this.service);
        Object.defineProperty(owner, 'application', { value: application, configurable: true });

        try {
            this.service.registerHook('order:created', () => {});

            assert.true(application.registrations.has('registry:hooks'));
        } finally {
            delete owner.application;
        }
    });

    test('the owner itself is the last resort', function (assert) {
        // No universe instance, none of its own, and an owner with no
        // `application` — which is what an EngineInstance looks like. The owner
        // is a real container, so this asserts through its own API.
        this.universe.applicationInstance = null;
        const owner = getOwner(this.service);

        this.service.registerHook('order:created', () => {});

        assert.true(owner.hasRegistration('registry:hooks'), 'the test owner received it directly');
    });

    test('the registry is created once and reused', function (assert) {
        const preferred = this.container('universe');
        this.universe.applicationInstance = preferred;

        this.service.registerHook('order:created', () => {});
        const first = preferred.registrations.get('registry:hooks');
        this.service.registerHook('order:updated', () => {});

        assert.strictEqual(preferred.registrations.get('registry:hooks'), first, 'a second hook does not replace it');
    });
});

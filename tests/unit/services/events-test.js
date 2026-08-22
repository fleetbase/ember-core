import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import config from 'dummy/config/environment';

module('Unit | Service | events', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.universeEvents = [];
        this.localEvents = [];
        const testContext = this;

        this.owner.register(
            'service:universe',
            class extends Service {
                trigger(name, ...args) {
                    testContext.universeEvents.push({ name, args });
                }
            }
        );

        this.owner.register('service:current-user', class extends Service {});

        this.service = this.owner.lookup('service:events');
        // Capture local listeners without depending on any particular event name.
        this.service.trigger = (name, ...args) => this.localEvents.push({ name, args });

        this.names = () => this.universeEvents.map((event) => event.name);
        this.propsOf = (name) => this.universeEvents.find((event) => event.name === name)?.args.at(-1);
    });

    hooks.afterEach(function () {
        delete config.events;
    });

    module('isEnabled', function () {
        test('events are enabled by default', function (assert) {
            assert.true(this.service.isEnabled());
        });

        test('only an explicit false disables them', function (assert) {
            config.events = { enabled: false };
            assert.false(this.service.isEnabled());

            config.events = { enabled: true };
            assert.true(this.service.isEnabled());

            config.events = {};
            assert.true(this.service.isEnabled(), 'an empty config leaves them enabled');
        });

        test('nothing is emitted while disabled', function (assert) {
            config.events = { enabled: false };

            this.service.trackSessionAuthenticated();

            assert.deepEqual(this.universeEvents, []);
            assert.deepEqual(this.localEvents, []);
        });
    });

    module('fan-out', function () {
        test('an event reaches both the local listeners and the universe', function (assert) {
            this.service.trackSessionAuthenticated();

            assert.deepEqual(this.names(), ['session.authenticated']);
            assert.deepEqual(
                this.localEvents.map((event) => event.name),
                ['session.authenticated']
            );
        });
    });

    module('session events', function () {
        test('authentication carries any extra properties', function (assert) {
            this.service.trackSessionAuthenticated({ method: 'password' });

            assert.strictEqual(this.propsOf('session.authenticated').method, 'password');
        });

        test('termination emits three aliases carrying the duration', function (assert) {
            this.service.trackSessionTerminated(120);

            assert.deepEqual(this.names(), ['session.invalidated', 'session.terminated', 'user.deauthenticated']);
            assert.strictEqual(this.propsOf('session.terminated').session_duration, 120);
            assert.strictEqual(this.universeEvents[0].args[0], 120, 'the duration is also passed positionally');
        });
    });

    module('user events', function () {
        test('user loaded records the user and organization', function (assert) {
            this.service.trackUserLoaded({ id: 'u1' }, { id: 'o1', name: 'Acme' });

            const props = this.propsOf('user.loaded');
            assert.strictEqual(props.user_id, 'u1');
            assert.strictEqual(props.organization_id, 'o1');
            assert.strictEqual(props.organization_name, 'Acme');
        });

        test('it tolerates a missing user or organization', function (assert) {
            this.service.trackUserLoaded(null, null);

            const props = this.propsOf('user.loaded');
            assert.strictEqual(props.user_id, undefined);
            assert.strictEqual(props.organization_id, undefined);
        });

        test('user updated records the user id', function (assert) {
            this.service.trackUserUpdated({ id: 'u1' }, { field: 'email' });

            const props = this.propsOf('user.updated');
            assert.strictEqual(props.user_id, 'u1');
            assert.strictEqual(props.field, 'email');
        });

        test('switching organization records the organization', function (assert) {
            this.service.trackOrganizationSwitched({ id: 'o2', name: 'Beta' });

            const props = this.propsOf('user.organization_switched');
            assert.strictEqual(props.organization_id, 'o2');
            assert.strictEqual(props.organization_name, 'Beta');
        });
    });

    module('resource events', function () {
        function record(overrides = {}) {
            return { id: 'r1', constructor: { modelName: 'order' }, name: 'Order 1', status: 'active', ...overrides };
        }

        test('creation emits a generic and a model-specific event', function (assert) {
            this.service.trackResourceCreated(record());

            assert.deepEqual(this.names(), ['resource.created', 'order.created']);
        });

        test('updating and deleting follow the same shape', function (assert) {
            this.service.trackResourceUpdated(record());
            assert.deepEqual(this.names(), ['resource.updated', 'order.updated']);

            this.universeEvents.length = 0;
            this.service.trackResourceDeleted(record());
            assert.deepEqual(this.names(), ['resource.deleted', 'order.deleted']);
        });

        test('it collects the safe properties of the resource', function (assert) {
            this.service.trackResourceCreated(record({ type: 'delivery', slug: 'order-1' }));

            const props = this.propsOf('resource.created');
            assert.strictEqual(props.id, 'r1');
            assert.strictEqual(props.model_name, 'order');
            assert.strictEqual(props.name, 'Order 1');
            assert.strictEqual(props.status, 'active');
            assert.strictEqual(props.type, 'delivery');
            assert.strictEqual(props.slug, 'order-1');
        });

        test('absent optional properties are left out rather than sent as null', function (assert) {
            this.service.trackResourceCreated({ id: 'r1', constructor: { modelName: 'order' }, status: null });

            const props = this.propsOf('resource.created');
            assert.notOk('name' in props, 'a missing property is omitted');
            assert.notOk('status' in props, 'a null property is omitted');
        });

        test('explicit properties win over the ones read off the resource', function (assert) {
            this.service.trackResourceCreated(record(), { name: 'Overridden' });

            assert.strictEqual(this.propsOf('resource.created').name, 'Overridden');
        });

        test('it tolerates a missing resource', function (assert) {
            this.service.trackResourceCreated(null);

            assert.strictEqual(this.universeEvents.length, 2, 'the events are still emitted');
        });
    });
});

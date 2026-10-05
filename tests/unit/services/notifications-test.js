import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import NotificationsService from '@fleetbase/ember-core/services/notifications';

// ember-cli-notifications ships its own app/services/notifications.js, which
// collides with this addon's re-export, so `service:notifications` does not
// reliably resolve to the subclass under test. Registering it explicitly pins
// the unit under test regardless of which app-tree file wins the build.
module('Unit | Service | notifications', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:fleetbase-notifications', NotificationsService);
        this.service = this.owner.lookup('service:fleetbase-notifications');
        this.errors = [];
        // `error` comes from ember-cli-notifications; capture it rather than
        // rendering real notifications.
        this.service.error = (message, options) => {
            this.errors.push({ message, options });
            return message;
        };
    });

    test('it surfaces the first message from an api error payload', function (assert) {
        this.service.serverError({ errors: ['Order not found', 'ignored'] });

        assert.deepEqual(this.errors[0].message, 'Order not found');
    });

    test('it falls back when the errors array is empty', function (assert) {
        this.service.serverError({ errors: [] }, 'Fallback message');

        assert.strictEqual(this.errors[0].message, 'Fallback message');
    });

    test('it uses the message of an Error instance', function (assert) {
        this.service.serverError(new Error('Boom'));

        assert.strictEqual(this.errors[0].message, 'Boom');
    });

    test('it passes a plain string through', function (assert) {
        this.service.serverError('Just a string');

        assert.strictEqual(this.errors[0].message, 'Just a string');
    });

    test('it falls back for anything else', function (assert) {
        this.service.serverError({}, 'Default message');
        this.service.serverError(null, 'Default message');

        assert.deepEqual(
            this.errors.map((entry) => entry.message),
            ['Default message', 'Default message']
        );
    });

    test('it uses the built-in fallback when none is supplied', function (assert) {
        this.service.serverError({});

        assert.strictEqual(this.errors[0].message, 'Oops! Something went wrong with your request.');
    });

    test('it forwards options to the underlying notification', function (assert) {
        this.service.serverError('message', 'fallback', { autoClear: false });

        assert.deepEqual(this.errors[0].options, { autoClear: false });
    });

    test('invoke calls the named notification type with a literal message', function (assert) {
        this.service.invoke('error', 'literal');

        assert.strictEqual(this.errors[0].message, 'literal');
    });

    test('invoke resolves a function message with the supplied params', function (assert) {
        this.service.invoke('error', (name, count) => `${name}: ${count}`, 'Orders', 3);

        assert.strictEqual(this.errors[0].message, 'Orders: 3');
    });
});

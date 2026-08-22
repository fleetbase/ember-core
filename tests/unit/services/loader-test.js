import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';

function fakeTransition({ to = 'console.orders', from = null } = {}) {
    return {
        to: { name: to },
        from: from ? { name: from } : null,
        finallyCallbacks: [],
        finally(callback) {
            this.finallyCallbacks.push(callback);
            return this;
        },
    };
}

module('Unit | Service | loader', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:loader');
        this.container = document.createElement('div');
        this.container.id = 'loader-target';
        document.body.appendChild(this.container);
    });

    hooks.afterEach(function () {
        this.container.remove();
        document.querySelectorAll('.overloader').forEach((node) => node.remove());
    });

    test('showOnCondition shows the loader only when the condition holds', function (assert) {
        this.service.showOnCondition(this.container, {}, false);
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 0);

        this.service.showOnCondition(this.container, {}, true);
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 1);
    });

    test('showOnCondition evaluates a function condition', function (assert) {
        this.service.showOnCondition(this.container, {}, () => false);
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 0);

        this.service.showOnCondition(this.container, {}, () => true);
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 1);
    });

    test('showLoader renders the message and returns the element', function (assert) {
        const loader = this.service.showLoader(this.container, { loadingMessage: 'Fetching orders' });

        assert.true(loader instanceof HTMLElement);
        assert.true(this.container.textContent.includes('Fetching orders'));
    });

    test('showLoader defaults the message and falls back to the body for a missing target', function (assert) {
        this.service.showLoader('#does-not-exist');

        const loader = document.body.querySelector('.overloader');
        assert.ok(loader, 'the loader is attached to the body');
        assert.true(loader.textContent.includes('Loading...'));
    });

    test('showLoader accepts a selector string', function (assert) {
        this.service.showLoader('#loader-target', { loadingMessage: 'By selector' });

        assert.true(this.container.textContent.includes('By selector'));
    });

    test('removeLoader clears the overlay', function (assert) {
        this.service.showLoader(this.container);
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 1);

        this.service.removeLoader(this.container);
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 0);
    });

    test('showOnInitialTransition records the route it loaded', function (assert) {
        assert.deepEqual(this.service.routesLoaded, []);

        this.service.showOnInitialTransition(fakeTransition(), this.container);

        assert.deepEqual(this.service.routesLoaded, ['console.orders']);
    });

    test('showOnInitialTransition removes the loader when the transition settles', function (assert) {
        const transition = fakeTransition();

        this.service.showOnInitialTransition(transition, this.container);
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 1);

        transition.finallyCallbacks.forEach((callback) => callback());
        assert.strictEqual(this.container.querySelectorAll('.overloader').length, 0);
    });

    test('showOnInitialTransition does not stack loaders', function (assert) {
        this.service.showLoader(this.container);

        this.service.showOnInitialTransition(fakeTransition({ to: 'console.other' }), this.container);

        assert.strictEqual(document.querySelectorAll('.overloader').length, 1, 'an existing overlay short-circuits');
    });

    test('showOnInitialTransition skips a repeat transition to the same route', function (assert) {
        const transition = fakeTransition({ to: 'console.orders', from: 'console.orders' });

        this.service.showOnInitialTransition(transition, this.container);
        document.querySelectorAll('.overloader').forEach((node) => node.remove());

        this.service.showOnInitialTransition(transition, this.container);

        assert.strictEqual(document.querySelectorAll('.overloader').length, 0, 'the route was already loaded and is unchanged');
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import { settled } from '@ember/test-helpers';

/**
 * The overlay styling options and the removal paths the sibling loader test does
 * not reach — `show`, `remove`, and the three ways `removeLoader` can be called.
 *
 * `document.body.dataset.theme` decides the overlay tint, so it is saved and
 * restored around every test rather than assumed.
 */
module('Unit | Service | loader (overlay options and removal)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.service = this.owner.lookup('service:loader');
        this.container = document.createElement('div');
        this.container.id = 'overlay-target';
        document.body.appendChild(this.container);

        this.previousTheme = document.body.dataset.theme;
    });

    hooks.afterEach(function () {
        this.container.remove();
        document.querySelectorAll('.overloader').forEach((node) => node.remove());

        if (this.previousTheme === undefined) {
            delete document.body.dataset.theme;
        } else {
            document.body.dataset.theme = this.previousTheme;
        }
    });

    module('styling', function () {
        test('the target is made a positioning context', function (assert) {
            this.service.showLoader(this.container);

            assert.strictEqual(this.container.style.position, 'relative');
        });

        test('preserveTargetPosition leaves the target position alone', function (assert) {
            this.service.showLoader(this.container, { preserveTargetPosition: true });

            assert.strictEqual(this.container.style.position, '', 'the caller keeps control of layout');
        });

        test('a dark theme tints the overlay grey and a light one near-white', function (assert) {
            document.body.dataset.theme = 'dark';
            const dark = this.service.showLoader(this.container);

            document.body.dataset.theme = 'light';
            const light = this.service.showLoader(this.container);

            assert.strictEqual(dark.style.backgroundColor, 'rgba(128, 128, 128, 0)');
            assert.strictEqual(light.style.backgroundColor, 'rgba(249, 250, 251, 0)');
        });

        test('an unset theme is treated as dark', function (assert) {
            delete document.body.dataset.theme;

            assert.strictEqual(this.service.showLoader(this.container).style.backgroundColor, 'rgba(128, 128, 128, 0)');
        });

        test('the opacity is configurable and defaults to zero', function (assert) {
            document.body.dataset.theme = 'dark';

            assert.strictEqual(this.service.showLoader(this.container, { opacity: 0.5 }).style.backgroundColor, 'rgba(128, 128, 128, 0.5)');
            assert.strictEqual(this.service.showLoader(this.container).style.backgroundColor, 'rgba(128, 128, 128, 0)');
        });

        test('a non-numeric opacity falls back to zero', function (assert) {
            document.body.dataset.theme = 'dark';

            assert.strictEqual(this.service.showLoader(this.container, { opacity: '0.5' }).style.backgroundColor, 'rgba(128, 128, 128, 0)');
        });

        test('an extra container class is applied', function (assert) {
            const loader = this.service.showLoader(this.container, { loaderContainerClass: 'my-loader' });

            assert.true(loader.querySelector('.loader-container').classList.contains('my-loader'));
        });

        test('a non-string message falls back to the default', function (assert) {
            const loader = this.service.showLoader(this.container, { loadingMessage: 42 });

            assert.true(loader.textContent.includes('Loading...'));
        });
    });

    module('show', function () {
        test('it puts an overlay on the body', function (assert) {
            const loader = this.service.show({ loadingMessage: 'Working' });

            assert.strictEqual(loader.parentNode, document.body);
            assert.true(loader.textContent.includes('Working'));
        });

        test('it defaults its own message and opacity', function (assert) {
            document.body.dataset.theme = 'dark';

            const loader = this.service.show();

            assert.true(loader.textContent.includes('Loading...'));
            assert.strictEqual(loader.style.backgroundColor, 'rgba(128, 128, 128, 0.1)');
        });
    });

    module('removeLoader', function () {
        test('it accepts the overlay element itself', function (assert) {
            const loader = this.service.showLoader(this.container);

            const result = this.service.removeLoader(loader);

            assert.strictEqual(this.container.querySelectorAll('.overloader').length, 0);
            assert.strictEqual(result, this.service, 'it returns the service for chaining');
        });

        test('it accepts a selector string', function (assert) {
            this.service.showLoader(this.container);

            this.service.removeLoader('#overlay-target');

            assert.strictEqual(this.container.querySelectorAll('.overloader').length, 0);
        });

        test('it clears the positioning it added', function (assert) {
            this.service.showLoader(this.container);
            assert.strictEqual(this.container.style.position, 'relative');

            this.service.removeLoader(this.container);

            assert.strictEqual(this.container.style.position, '');
        });

        test('a target with no overlay returns nothing', function (assert) {
            assert.strictEqual(this.service.removeLoader(this.container), undefined, 'rather than the service, unlike every other path');
        });

        test('an unresolvable selector falls back to the body', function (assert) {
            this.service.show();

            this.service.removeLoader('#does-not-exist');

            assert.strictEqual(document.body.querySelectorAll(':scope > .overloader').length, 0);
        });
    });

    module('removeStyle fallback', function () {
        test('a style object without removeProperty falls back to removeAttribute', function (assert) {
            // The helper inside removeLoader tries `el.style.removeProperty` and
            // falls back to `removeAttribute` for hosts that lack it. A real DOM
            // element always has removeProperty, so the fallback needs a target
            // whose style object does not.
            const removed = [];
            const loader = document.createElement('div');
            loader.classList.add('overloader');
            const target = {
                style: { removeAttribute: (name) => removed.push(name) },
                classList: { contains: () => false },
                querySelector: () => loader,
                removeChild: () => {},
            };

            const result = this.service.removeLoader(target);

            assert.deepEqual(removed, ['position']);
            assert.strictEqual(result, this.service);
        });
    });

    module('remove', function () {
        test('it clears every overlay on the page', async function (assert) {
            this.service.show();
            this.service.showLoader(this.container);
            assert.strictEqual(document.querySelectorAll('.overloader').length, 2);

            const result = this.service.remove();
            assert.strictEqual(result, this.service, 'it returns before the removal actually happens');

            await settled();

            assert.strictEqual(document.querySelectorAll('.overloader').length, 0);
        });

        test('the removal can be delayed', async function (assert) {
            this.service.show();

            this.service.remove(10);
            assert.strictEqual(document.querySelectorAll('.overloader').length, 1, 'still there immediately after the call');

            await settled();

            assert.strictEqual(document.querySelectorAll('.overloader').length, 0);
        });
    });
});

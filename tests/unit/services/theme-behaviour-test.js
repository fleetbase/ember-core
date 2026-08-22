import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * ThemeService resolves an active theme from the user's stored preference, the
 * initial theme, then the OS preference, and mirrors it onto the document body.
 *
 * Every test mutates the real document body, so the classes and the theme
 * dataset entry are captured up front and restored afterwards — otherwise the
 * theme leaks into whatever test runs next.
 */
module('Unit | Service | theme (behaviour)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.options = {};
        this.events = [];
        const testContext = this;

        this.owner.register(
            'service:current-user',
            class extends Service {
                getOption(key, defaultValue = null) {
                    return testContext.options[key] !== undefined ? testContext.options[key] : defaultValue;
                }
                setOption(key, value) {
                    testContext.options[key] = value;
                    return this;
                }
            }
        );

        // The service reads `router:main` out of the container, so a fake is
        // registered rather than mutating the real router, which other tests
        // in the run share.
        this.routerSubscriptions = [];
        this.router = {
            currentRouteName: 'console.home',
            on: (eventName, handler) => this.routerSubscriptions.push({ eventName, handler }),
        };
        this.owner.register('router:main', this.router, { instantiate: false });

        this.bodyClasses = document.body.className;
        this.bodyTheme = document.body.dataset.theme;

        this.service = this.owner.lookup('service:theme');
        this.service.trigger = (name, ...args) => this.events.push({ name, args });
    });

    hooks.afterEach(function () {
        document.body.className = this.bodyClasses;
        if (this.bodyTheme === undefined) {
            delete document.body.dataset.theme;
        } else {
            document.body.dataset.theme = this.bodyTheme;
        }
    });

    module('resolving the active theme', function () {
        test('a stored user preference wins', function (assert) {
            this.options.theme = 'light';

            assert.strictEqual(this.service.activeTheme, 'light');
        });

        test('the initial theme is next', function (assert) {
            this.service.initialTheme = 'dark';

            assert.strictEqual(this.service.activeTheme, 'dark');
        });

        test('a stored preference beats the initial theme', function (assert) {
            this.options.theme = 'light';
            this.service.initialTheme = 'dark';

            assert.strictEqual(this.service.activeTheme, 'light');
        });

        test('with neither it consults the OS preference', function (assert) {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

            assert.strictEqual(this.service.activeTheme, prefersDark ? 'dark' : this.service.currentTheme);
        });

        test('currentTheme defaults to dark', function (assert) {
            assert.strictEqual(this.service.currentTheme, 'dark', 'when the user has stored nothing');
        });
    });

    module('setting the theme', function () {
        test('setting activeTheme mirrors onto the body dataset', function (assert) {
            this.service.activeTheme = 'light';

            assert.strictEqual(document.body.dataset.theme, 'light');
            assert.strictEqual(this.service.currentTheme, 'light');
        });

        test('applyTheme swaps the body class and persists the choice', function (assert) {
            this.service.applyTheme('light');

            assert.true(document.body.classList.contains('light-theme'));
            assert.false(document.body.classList.contains('dark-theme'));
            assert.strictEqual(this.options.theme, 'light', 'the preference is stored');
            assert.strictEqual(document.body.dataset.theme, 'light');
        });

        test('applyTheme announces the change', function (assert) {
            this.service.applyTheme('light');

            assert.deepEqual(this.events, [{ name: 'theme.changed', args: ['light'] }]);
        });

        test('persist false applies without storing', function (assert) {
            this.service.applyTheme('light', { persist: false });

            assert.true(document.body.classList.contains('light-theme'));
            assert.strictEqual(this.options.theme, undefined, 'nothing was written to the user');
        });

        test('only an explicit false disables persistence', function (assert) {
            this.service.applyTheme('light', { persist: undefined });

            assert.strictEqual(this.options.theme, 'light');
        });

        test('applyTheme defaults to light', function (assert) {
            this.service.applyTheme();

            assert.strictEqual(this.options.theme, 'light');
        });

        test('setTheme applies and persists', function (assert) {
            this.service.setTheme('dark');

            assert.strictEqual(this.options.theme, 'dark');
            assert.true(document.body.classList.contains('dark-theme'));
        });

        test('setTheme defaults to light', function (assert) {
            this.service.setTheme();

            assert.strictEqual(this.options.theme, 'light');
        });

        test('applying a theme clears the previous one', function (assert) {
            this.service.applyTheme('dark');
            this.service.applyTheme('light');

            assert.true(document.body.classList.contains('light-theme'));
            assert.false(document.body.classList.contains('dark-theme'));
        });
    });

    module('toggling', function () {
        test('dark toggles to light and back', function (assert) {
            this.service.currentTheme = 'dark';

            assert.strictEqual(this.service.toggleTheme(), 'light');
            assert.strictEqual(this.service.currentTheme, 'light');

            assert.strictEqual(this.service.toggleTheme(), 'dark');
            assert.strictEqual(this.service.currentTheme, 'dark');
        });

        test('anything that is not light toggles to light', function (assert) {
            this.service.currentTheme = 'something-else';

            assert.strictEqual(this.service.toggleTheme(), 'light');
        });

        test('toggling persists the new theme', function (assert) {
            this.service.currentTheme = 'dark';

            this.service.toggleTheme();

            assert.strictEqual(this.options.theme, 'light');
        });
    });

    module('syncing from the user', function () {
        test('it applies the stored preference without rewriting it', function (assert) {
            this.options.theme = 'light';
            this.service.currentTheme = 'dark';

            this.service.syncThemeFromCurrentUser();

            assert.strictEqual(this.service.currentTheme, 'light');
            assert.deepEqual(this.events, [{ name: 'theme.changed', args: ['light'] }]);
        });
    });

    module('body classes', function () {
        test('the route class name is dasherized with dots as spaces', function (assert) {
            this.router.currentRouteName = 'console.fleet-ops.orders';

            assert.strictEqual(this.service.routeClassName, 'console-fleet-ops-orders');
        });

        test('a missing route name falls back to a console class', function (assert) {
            this.router.currentRouteName = undefined;

            assert.strictEqual(this.service.routeClassName, 'fleetbase-console');
        });

        test('setting body class names adds the route and theme classes', function (assert) {
            this.router.currentRouteName = 'console.home';
            this.service.currentTheme = 'dark';

            this.service.setRoutebodyClassNames(['extra']);

            assert.true(document.body.classList.contains('console-home'));
            assert.true(document.body.classList.contains('dark-theme'));
            assert.true(document.body.classList.contains('extra'));
        });

        test('removing takes the same set away again', function (assert) {
            this.router.currentRouteName = 'console.home';
            this.service.setRoutebodyClassNames(['extra']);

            this.service.removeRoutebodyClassNames(['extra']);

            assert.false(document.body.classList.contains('console-home'));
            assert.false(document.body.classList.contains('extra'));
        });

        test('extra classes are optional', function (assert) {
            this.router.currentRouteName = 'console.home';

            this.service.setRoutebodyClassNames();

            assert.true(document.body.classList.contains('console-home'));
        });

        test('a route with no bodyClassNames contributes none', function (assert) {
            assert.deepEqual(this.service.currentRouteBodyClasses, []);
        });
    });

    module('environment', function () {
        test('sandbox mode marks the console', function (assert) {
            this.options.sandbox = true;

            this.service.setEnvironment();

            assert.true(document.body.classList.contains('sandbox-console'));
        });

        test('leaving sandbox mode clears the mark', function (assert) {
            this.options.sandbox = true;
            this.service.setEnvironment();

            this.options.sandbox = false;
            this.service.setEnvironment();

            assert.false(document.body.classList.contains('sandbox-console'));
        });
    });

    module('initialize', function () {
        test('it applies the active theme without persisting it', function (assert) {
            this.options.theme = 'light';
            this.service.currentTheme = 'dark';

            this.service.initialize();

            assert.true(document.body.classList.contains('light-theme'));
            assert.strictEqual(this.service.currentTheme, 'light');
        });

        test('an initial theme option is recorded', function (assert) {
            this.service.initialize({ theme: 'dark' });

            assert.strictEqual(this.service.initialTheme, 'dark');
        });

        test('it subscribes to both route transition hooks', function (assert) {
            this.service.initialize();

            assert.deepEqual(
                this.routerSubscriptions.map((s) => s.eventName),
                ['routeDidChange', 'routeWillChange']
            );
        });

        test('supplied body class names are applied', function (assert) {
            this.service.initialize({ bodyClassNames: ['custom-class'] });

            assert.true(document.body.classList.contains('custom-class'));
        });

        test('a non-array bodyClassNames is ignored rather than spread', function (assert) {
            this.service.initialize({ bodyClassNames: 'not-an-array' });

            assert.true(document.body.classList.contains('console-home'), 'the route class still lands');
        });

        test('it marks the environment', function (assert) {
            this.options.sandbox = true;

            this.service.initialize();

            assert.true(document.body.classList.contains('sandbox-console'));
        });

        test('an onInit callback receives the service', function (assert) {
            const seen = [];

            this.service.initialize({ onInit: (service) => seen.push(service) });

            assert.deepEqual(seen, [this.service]);
        });

        test('a non-function onInit is ignored', function (assert) {
            this.service.initialize({ onInit: 'not a function' });

            assert.true(document.body.classList.contains('console-home'), 'initialization still completed');
        });
    });

    module('route transitions', function () {
        test('entering a route adds its body classes', function (assert) {
            this.router.currentRouteName = 'console.orders';

            this.service.routeDidChange();

            assert.true(document.body.classList.contains('console-orders'));
        });

        test('leaving a route removes them again', function (assert) {
            this.router.currentRouteName = 'console.orders';
            this.service.routeDidChange();

            this.service.routeWillChange();

            assert.false(document.body.classList.contains('console-orders'));
        });

        test('a route declaring bodyClassNames contributes them', function (assert) {
            this.owner.register('route:console.orders', { bodyClassNames: ['orders-page'] }, { instantiate: false });
            this.router.currentRouteName = 'console.orders';

            assert.deepEqual(this.service.currentRouteBodyClasses, ['orders-page']);

            this.service.routeDidChange();
            assert.true(document.body.classList.contains('orders-page'));
        });

        test('a route whose bodyClassNames is not an array contributes none', function (assert) {
            this.owner.register('route:console.orders', { bodyClassNames: 'orders-page' }, { instantiate: false });
            this.router.currentRouteName = 'console.orders';

            assert.deepEqual(this.service.currentRouteBodyClasses, []);
        });
    });

    module('page chrome', function () {
        test('removing the console loader is safe when there is none', function (assert) {
            this.service.removeConsoleLoader();

            assert.strictEqual(document.getElementById('console-loader'), null);
        });

        test('an existing console loader is removed', function (assert) {
            const loader = document.createElement('div');
            loader.id = 'console-loader';
            document.body.appendChild(loader);

            this.service.removeConsoleLoader();

            assert.strictEqual(document.getElementById('console-loader'), null);
        });
    });
});

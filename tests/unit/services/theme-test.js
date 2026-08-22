import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

module('Unit | Service | theme', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.userOptions = {};
        const testContext = this;

        this.owner.register(
            'service:current-user',
            class extends Service {
                getOption(key, defaultValue = null) {
                    return testContext.userOptions[key] !== undefined ? testContext.userOptions[key] : defaultValue;
                }
                setOption(key, value) {
                    testContext.userOptions[key] = value;
                }
            }
        );

        this.originalBodyClass = document.body.className;
        this.originalTheme = document.body.dataset.theme;
    });

    hooks.afterEach(function () {
        document.body.className = this.originalBodyClass;
        if (this.originalTheme === undefined) {
            delete document.body.dataset.theme;
        } else {
            document.body.dataset.theme = this.originalTheme;
        }
    });

    module('activeTheme', function () {
        test('a stored user preference wins', function (assert) {
            this.userOptions.theme = 'light';

            assert.strictEqual(this.owner.lookup('service:theme').activeTheme, 'light');
        });

        test('an initial theme is used when the user has no preference', function (assert) {
            const service = this.owner.lookup('service:theme');
            service.initialTheme = 'light';

            assert.strictEqual(service.activeTheme, 'light');
        });

        test('the user preference beats the initial theme', function (assert) {
            this.userOptions.theme = 'dark';
            const service = this.owner.lookup('service:theme');
            service.initialTheme = 'light';

            assert.strictEqual(service.activeTheme, 'dark');
        });
    });

    module('applying a theme', function () {
        test('it swaps the body theme class', function (assert) {
            const service = this.owner.lookup('service:theme');

            service.applyTheme('light');
            assert.true(document.body.classList.contains('light-theme'));
            assert.false(document.body.classList.contains('dark-theme'));

            service.applyTheme('dark');
            assert.true(document.body.classList.contains('dark-theme'));
            assert.false(document.body.classList.contains('light-theme'));
        });

        test('it records the theme on the body dataset and the service', function (assert) {
            const service = this.owner.lookup('service:theme');

            service.applyTheme('light');

            assert.strictEqual(document.body.dataset.theme, 'light');
            assert.strictEqual(service.currentTheme, 'light');
        });

        test('it persists the choice to the user by default', function (assert) {
            this.owner.lookup('service:theme').applyTheme('light');

            assert.strictEqual(this.userOptions.theme, 'light');
        });

        test('persist false leaves the user preference alone', function (assert) {
            this.owner.lookup('service:theme').applyTheme('light', { persist: false });

            assert.strictEqual(this.userOptions.theme, undefined);
        });

        test('it emits theme.changed', function (assert) {
            const service = this.owner.lookup('service:theme');
            const seen = [];
            service.on('theme.changed', (theme) => seen.push(theme));

            service.applyTheme('light');

            assert.deepEqual(seen, ['light']);
        });

        test('it defaults to light', function (assert) {
            const service = this.owner.lookup('service:theme');

            service.applyTheme();

            assert.strictEqual(service.currentTheme, 'light');
        });
    });

    module('toggling', function () {
        test('it flips between light and dark', function (assert) {
            const service = this.owner.lookup('service:theme');

            service.setTheme('light');
            assert.strictEqual(service.toggleTheme(), 'dark');
            assert.strictEqual(service.currentTheme, 'dark');

            assert.strictEqual(service.toggleTheme(), 'light');
            assert.strictEqual(service.currentTheme, 'light');
        });

        test('setTheme defaults to light', function (assert) {
            const service = this.owner.lookup('service:theme');

            service.setTheme('dark');
            service.setTheme();

            assert.strictEqual(service.currentTheme, 'light');
        });

        test('syncThemeFromCurrentUser applies without persisting', function (assert) {
            this.userOptions.theme = 'light';
            const service = this.owner.lookup('service:theme');

            service.syncThemeFromCurrentUser();

            assert.strictEqual(service.currentTheme, 'light');
        });
    });

    module('environment', function () {
        test('the sandbox class follows the user option', function (assert) {
            const service = this.owner.lookup('service:theme');

            this.userOptions.sandbox = true;
            service.setEnvironment();
            assert.true(document.body.classList.contains('sandbox-console'));

            this.userOptions.sandbox = false;
            service.setEnvironment();
            assert.false(document.body.classList.contains('sandbox-console'));
        });
    });

    module('body classes', function () {
        test('route body classes are added and removed together with the theme class', function (assert) {
            const service = this.owner.lookup('service:theme');
            service.currentTheme = 'dark';

            service.setRoutebodyClassNames(['custom-class']);
            assert.true(document.body.classList.contains('custom-class'));
            assert.true(document.body.classList.contains('dark-theme'));

            service.removeRoutebodyClassNames(['custom-class']);
            assert.false(document.body.classList.contains('custom-class'));
        });

        test('it works with no extra classes', function (assert) {
            const service = this.owner.lookup('service:theme');

            service.setRoutebodyClassNames();

            assert.true(document.body.classList.contains(`${service.currentTheme}-theme`));
        });
    });

    module('console loader', function () {
        test('it removes the loader element when present', function (assert) {
            const loader = document.createElement('div');
            loader.id = 'console-loader';
            document.body.appendChild(loader);

            this.owner.lookup('service:theme').removeConsoleLoader();

            assert.strictEqual(document.getElementById('console-loader'), null);
        });

        test('it is a no-op when there is no loader', function (assert) {
            this.owner.lookup('service:theme').removeConsoleLoader();

            assert.strictEqual(document.getElementById('console-loader'), null);
        });
    });
});

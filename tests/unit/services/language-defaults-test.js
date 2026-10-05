import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';

/**
 * `countries` before the task that fills it has resolved.
 *
 * The constructor kicks off loadAvailableCountries, but that task yields on its
 * very first statement, so the field is still its declared default when the
 * constructor returns. Reading it there is the only moment the initialiser runs.
 */
module('Unit | Service | language (declared defaults)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register(
            'service:fetch',
            class extends Service {
                get() {
                    // Never resolves, so the task cannot overwrite the default.
                    return new Promise(() => {});
                }
            }
        );
        this.owner.register(
            'service:intl',
            class extends Service {
                locales = ['en-us'];
                primaryLocale = 'en-us';
                onLocaleChanged() {}
                setLocale() {}
            }
        );
    });

    test('countries starts as an empty list', function (assert) {
        const service = this.owner.factoryFor('service:language').create();

        assert.deepEqual(service.countries, [], 'before the lookup comes back');
    });

    test('languages is empty until the locale map is built', function (assert) {
        const service = this.owner.factoryFor('service:language').create();

        assert.deepEqual(service.languages, []);
    });
});

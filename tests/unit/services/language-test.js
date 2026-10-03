import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';

const COUNTRIES = [
    { name: 'United States', cca2: 'US', flag: '🇺🇸', emoji: '🇺🇸', languages: { eng: 'English' } },
    { name: 'France', cca2: 'FR', flag: '🇫🇷', emoji: '🇫🇷', languages: { fra: 'French' } },
];

module('Unit | Service | language', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.localeChangedCallbacks = [];
        this.posted = [];
        this.countriesResponse = Promise.resolve(COUNTRIES);

        const testContext = this;

        this.owner.register(
            'service:intl',
            class extends Service {
                locales = ['en-us', 'fr-fr'];
                primaryLocale = 'en-us';
                setLocale(locale) {
                    this.primaryLocale = locale;
                    testContext.localeChangedCallbacks.forEach((callback) => callback());
                }
                onLocaleChanged(callback) {
                    testContext.localeChangedCallbacks.push(callback);
                }
            }
        );

        this.owner.register(
            'service:fetch',
            class extends Service {
                get() {
                    return testContext.countriesResponse;
                }
                post(uri, payload) {
                    testContext.posted.push({ uri, payload });
                    return Promise.resolve({});
                }
            }
        );
    });

    test('it seeds locales and the current locale from intl', async function (assert) {
        const service = this.owner.lookup('service:language');
        await settled();

        assert.deepEqual(service.locales, ['en-us', 'fr-fr']);
        assert.strictEqual(service.currentLocale, 'en-us');
    });

    test('it builds an available locale map from the country lookup', async function (assert) {
        const service = this.owner.lookup('service:language');
        await settled();

        assert.deepEqual(service.countries, COUNTRIES);
        assert.strictEqual(service.availableLocales['en-us'].cca2, 'US');
        assert.strictEqual(service.availableLocales['fr-fr'].cca2, 'FR');
    });

    test('it exposes languages with their locale attached', async function (assert) {
        const service = this.owner.lookup('service:language');
        await settled();

        const languages = service.languages;
        assert.strictEqual(languages.length, 2);
        assert.deepEqual(languages.map((entry) => entry.locale).sort(), ['en-us', 'fr-fr']);
        assert.strictEqual(languages.find((entry) => entry.locale === 'en-us').language, 'English');
    });

    test('it skips locales with no matching country', async function (assert) {
        this.owner.register(
            'service:intl',
            class extends Service {
                locales = ['en-us', 'xx-zz'];
                primaryLocale = 'en-us';
                setLocale() {}
                onLocaleChanged() {}
            }
        );

        const service = this.owner.lookup('service:language');
        await settled();

        assert.strictEqual(service.availableLocales['xx-zz'], undefined);
        assert.strictEqual(service.languages.length, 1, 'unmatched locales are left out of the language list');
    });

    test('getLanguage and hasLanguage find a language by name', async function (assert) {
        const service = this.owner.lookup('service:language');
        await settled();

        assert.strictEqual(service.getLanguage('English').locale, 'en-us');
        assert.true(service.hasLanguage('English'));
        assert.strictEqual(service.getLanguage('Klingon'), null);
        assert.false(service.hasLanguage('Klingon'));
    });

    test('getLanguage honours a custom property', async function (assert) {
        const service = this.owner.lookup('service:language');
        await settled();

        assert.strictEqual(service.getLanguage('FR', { prop: 'cca2' }).locale, 'fr-fr');
    });

    test('changeLocale updates intl and persists the choice', async function (assert) {
        const service = this.owner.lookup('service:language');
        await settled();

        service.changeLocale('fr-fr');
        await settled();

        assert.strictEqual(service.currentLocale, 'fr-fr');
        assert.deepEqual(this.posted, [{ uri: 'users/locale', payload: { locale: 'fr-fr' } }]);
    });

    test('it survives a failing country lookup', async function (assert) {
        this.countriesResponse = Promise.reject(new Error('network down'));

        const service = this.owner.lookup('service:language');
        await settled();

        assert.deepEqual(service.availableLocales, {}, 'the locale map stays empty rather than throwing');
        assert.deepEqual(service.languages, []);
    });
});

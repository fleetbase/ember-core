import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { debug } from '@ember/debug';
import { task } from 'ember-concurrency';

export default class LanguageService extends Service {
    @service intl;
    @service fetch;
    @tracked locales = [];
    @tracked countries = [];
    @tracked currentLocale;
    @tracked availableLocales = {};

    get languages() {
        const availableLanguages = [];
        for (let key in this.availableLocales) {
            if (!key || !this.availableLocales[key]) continue;

            availableLanguages.push({
                ...this.availableLocales[key],
                locale: key,
            });
        }

        return availableLanguages;
    }

    constructor() {
        super(...arguments);

        this.locales = this.intl.locales;
        this.currentLocale = this.intl.primaryLocale;
        this.loadAvailableCountries.perform();

        // Check for locale change
        this.intl.onLocaleChanged(() => {
            this.currentLocale = this.intl.primaryLocale;
        });
    }

    @action changeLocale(selectedLocale) {
        this.currentLocale = selectedLocale;
        this.intl.setLocale(selectedLocale);
        this.saveUserLocale.perform(selectedLocale);
    }

    @task *loadAvailableCountries() {
        try {
            this.countries = yield this.fetch.get(
                'lookup/countries',
                { columns: ['name', 'cca2', 'flag', 'emoji', 'languages'] },
                { fromCache: true, expirationInterval: 1, expirationIntervalUnit: 'week' }
            );
            this.availableLocales = this._createAvailableLocaleMap();
        } catch (error) {
            debug('Locale Error: ' + error.message);
        }
    }

    @task *saveUserLocale(locale) {
        try {
            yield this.fetch.post('users/locale', { locale });
        } catch (err) {
            debug('[LanguageService] Unable to save user locale: ' + err.message);
        }
    }

    getLanguage(languageName, options = { prop: 'language' }) {
        const { prop } = options;

        return this.languages?.find((l) => l[prop] === languageName) ?? null;
    }

    hasLanguage(languageName, options = { prop: 'language' }) {
        return this.getLanguage(languageName, options) !== null;
    }

    _createAvailableLocaleMap() {
        const localeMap = {};

        for (let i = 0; i < this.locales.length; i++) {
            const locale = this.locales.objectAt(i);

            localeMap[locale] = this._findCountryDataForLocale(locale);
        }

        return localeMap;
    }

    _findCountryDataForLocale(locale) {
        const localeCountry = locale.split('-')[1];
        const country = this.countries.find((country) => country.cca2.toLowerCase() === localeCountry);

        if (country) {
            // get the language
            country.language = Object.values(country.languages)[0];
        }

        return country;
    }
}

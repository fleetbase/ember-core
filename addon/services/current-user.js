import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { dasherize } from '@ember/string';
import { computed, get } from '@ember/object';
import { isBlank } from '@ember/utils';
import { alias } from '@ember/object/computed';
import { storageFor } from 'ember-local-storage';
import { debug } from '@ember/debug';

export default class CurrentUserService extends Service.extend(Evented) {
    @service session;
    @service store;
    @service fetch;
    @service theme;
    @service notifications;
    @service intl;

    @tracked user = { id: 'anon' };
    @tracked userSnapshot = { id: 'anon' };
    @tracked company = {};
    @tracked permissions = [];
    @tracked organizations = [];
    @tracked whoisData = {};
    @tracked locale = 'en-us';

    @storageFor('user-options') options;
    @alias('userSnapshot.id') id;
    @alias('userSnapshot.name') name;
    @alias('userSnapshot.phone') phone;
    @alias('userSnapshot.email') email;
    @alias('userSnapshot.avatar_url') avatarUrl;
    @alias('userSnapshot.is_admin') isAdmin;
    @alias('userSnapshot.company_uuid') companyId;
    @alias('userSnapshot.company_name') companyName;
    @alias('userSnapshot.role_name') roleName;
    @alias('userSnapshot.role') role;

    @computed('id') get optionsPrefix() {
        return `${this.id}:`;
    }

    get latitude() {
        return this.whois('latitude');
    }

    get longitude() {
        return this.whois('longitude');
    }

    get currency() {
        return this.whois('currency.code');
    }

    get city() {
        return this.whois('city');
    }

    get country() {
        return this.whois('country_code');
    }

    async load() {
        if (this.session.isAuthenticated) {
            const user = await this.store.findRecord('user', 'me');
            const snapshot = await this.getUserSnapshot(user);

            this.set('user', user);
            this.set('userSnapshot', snapshot);
            this.trigger('user.loaded', user);

            // Set permissions
            this.permissions = this.getUserPermissions(user);

            // Load preferences
            await this.loadPreferences();

            return user;
        }

        return null;
    }

    async promiseUser(options = {}) {
        const NoUserAuthenticatedError = new Error('Failed to authenticate user.');
        if (!this.session.isAuthenticated) {
            throw NoUserAuthenticatedError;
        }

        try {
            const user = await this.store.queryRecord('user', { me: true });
            const snapshot = await this.getUserSnapshot(user);

            // Set current user
            this.set('user', user);
            this.set('userSnapshot', snapshot);
            this.trigger('user.loaded', user);

            // Set permissions
            this.permissions = this.getUserPermissions(user);

            // Set environment from user option
            this.theme.setEnvironment();

            // Set locale
            if (user.locale) {
                this.setLocale(user.locale);
            } else {
                await this.loadLocale();
            }

            // Load user whois data
            await this.loadWhois();

            // Load user organizations
            await this.loadOrganizations();

            // Optional callback
            if (typeof options?.onUserResolved === 'function') {
                options.onUserResolved(user);
            }

            return user;
        } catch (error) {
            debug(`Error loading current user : ${error.message}`);
            throw error;
        }
    }

    async loadPreferences() {
        await this.loadLocale();
        await this.loadWhois();
        await this.loadOrganizations();
    }

    async loadLocale() {
        try {
            const { locale } = await this.fetch.get('users/locale');
            this.setLocale(locale);

            return locale;
        } catch (error) {
            this.notifications.serverError(error);
        }
    }

    async loadOrganizations() {
        try {
            const organizations = await this.fetch.get('auth/organizations', {}, { normalizeToEmberData: true, normalizeModelType: 'company' });
            this.setOption('organizations', organizations);
            this.organizations = organizations;

            return organizations;
        } catch (error) {
            this.notifications.serverError(error);
        }
    }

    async loadWhois() {
        this.fetch.shouldResetCache();

        try {
            const whois = await this.fetch.cachedGet(
                'lookup/whois',
                {},
                {
                    expirationInterval: 60,
                    expirationIntervalUnit: 'minutes',
                }
            );
            this.setOption('whois', whois);
            this.whoisData = whois;

            return whois;
        } catch (error) {
            this.notifications.serverError(error);
        }
    }

    getCompany() {
        this.company = this.store.peekRecord('company', this.user.company_uuid);
        return this.company;
    }

    async loadCompany() {
        const company = this.store.peekRecord('company', this.user.company_uuid);
        if (company) {
            return company;
        }

        return this.store.findRecord('company', this.user.company_uuid);
    }

    getUserPermissions(user) {
        const permissions = [];

        // get direct applied permissions
        if (user.get('permissions')) {
            permissions.pushObjects(user.get('permissions').toArray());
        }

        // get role permissions and role policies permissions
        if (user.get('role')) {
            if (user.get('role.permissions')) {
                permissions.pushObjects(user.get('role.permissions').toArray());
            }

            if (user.get('role.policies')) {
                for (let i = 0; i < user.get('role.policies').length; i++) {
                    const policy = user.get('role.policies').objectAt(i);
                    if (policy.get('permissions')) {
                        permissions.pushObjects(policy.get('permissions').toArray());
                    }
                }
            }
        }

        // get direct applied policy permissions
        if (user.get('policies')) {
            for (let i = 0; i < user.get('policies').length; i++) {
                const policy = user.get('policies').objectAt(i);
                if (policy.get('permissions')) {
                    permissions.pushObjects(policy.get('permissions').toArray());
                }
            }
        }

        return permissions;
    }

    whois(key) {
        return this.getWhoisProperty(key);
    }

    setLocale(locale) {
        this.setOption('locale', locale);
        this.intl.setLocale(locale);
        this.locale = locale;

        return this;
    }

    setOption(key, value) {
        key = `${this.optionsPrefix}${dasherize(key)}`;

        this.options.set(key, value);

        return this;
    }

    getOption(key, defaultValue = null) {
        key = `${this.optionsPrefix}${dasherize(key)}`;

        const value = this.options.get(key);
        return value !== undefined ? value : defaultValue;
    }

    getWhoisProperty(prop) {
        const whois = this.getOption('whois');

        if (!whois || typeof whois !== 'object') {
            return null;
        }

        return get(whois, prop);
    }

    hasOption(key) {
        return this.getOption(key) !== undefined;
    }

    filledOption(key) {
        return !isBlank(this.getOption(key));
    }

    async getUserSnapshot(user) {
        const role = await user.get('role');
        const snapshot = user.serialize({ includeId: true });

        return {
            ...snapshot,
            id: snapshot.uuid,
            company_name: user.get('company_name'),
            role_name: user.get('role_name'),
            role: {
                ...role.serialize({ includeId: true }),
                id: role.get('id'),
            },
        };
    }

    getCompanyOption(key, defaultValue = null) {
        const company = this.store.peekRecord('company', this.companyId);
        if (company) {
            const value = get(company, `options.${key}`);
            if (value === undefined) {
                return defaultValue;
            }

            return value;
        }

        return defaultValue;
    }
}

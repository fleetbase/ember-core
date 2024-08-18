import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { dasherize } from '@ember/string';
import { computed, get, action } from '@ember/object';
import { isBlank } from '@ember/utils';
import { alias } from '@ember/object/computed';
import { storageFor } from 'ember-local-storage';

export default class CurrentUserService extends Service.extend(Evented) {
    /**
     * Inject the `session` service
     *
     * @var {Service}
     */
    @service session;

    /**
     * Inject the `store` service
     *
     * @var {Service}
     */
    @service store;

    /**
     * Inject the `fetch` service
     *
     * @var {Service}
     */
    @service fetch;

    /**
     * Inject the `theme` service
     *
     * @var {Service}
     */
    @service theme;

    /**
     * Inject the `notifications` service
     *
     * @var {Service}
     */
    @service notifications;

    /**
     * Property to hold loaded user.
     *
     * @var {UserModel|Object}
     * @memberof CurrentUserService
     */
    @tracked user = {
        id: 'anon',
    };

    /**
     * The current users permissions.
     *
     * @memberof CurrentUserService
     */
    @tracked permissions = [];

    /**
     * User options in localStorage
     *
     * @var StorageObject
     */
    @storageFor('user-options') options;

    /**
     * Alias for current user id
     *
     * @var {String}
     */
    @alias('user.id') id;

    /**
     * Alias for current user name
     *
     * @var {String}
     */
    @alias('user.name') name;

    /**
     * Alias for current user phone
     *
     * @var {String}
     */
    @alias('user.phone') phone;

    /**
     * Alias for current user phone
     *
     * @var {String}
     */
    @alias('user.email') email;

    /**
     * Alias for current user's company id
     *
     * @var {String}
     */
    @alias('user.company_uuid') companyId;

    /**
     * Alias for if user is admin.
     *
     * @var {Boolean}
     * @memberof CurrentUserService
     */
    @alias('user.is_admin') isAdmin;

    /**
     * The prefix for this user options
     *
     * @var {String}
     */
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

    /**
     * Loads the current authenticated user
     *
     * @return Promise<UserModel>|null
     */
    async load() {
        if (this.session.isAuthenticated) {
            let user = await this.store.findRecord('user', 'me');
            this.set('user', user);
            this.trigger('user.loaded', user);

            // Set permissions
            this.permissions = this.getUserPermissions(user);

            return user;
        }

        return null;
    }

    /**
     * Resolves a user model.
     *
     * @return {Promise<User>}
     */
    @action promiseUser(options = {}) {
        const NoUserAuthenticatedError = new Error('Failed to authenticate user.');

        return new Promise((resolve, reject) => {
            if (this.session.isAuthenticated) {
                try {
                    this.store.queryRecord('user', { me: true }).then((user) => {
                        // set the `current user`
                        this.set('user', user);
                        this.trigger('user.loaded', user);

                        // Set permissions
                        this.permissions = this.getUserPermissions(user);

                        // set environment from user option
                        this.theme.setEnvironment();

                        // @TODO Create an event dispatch for when an authenticated user is resolved from the server
                        if (typeof options?.onUserResolved === 'function') {
                            options.onUserResolved(user);
                        }

                        resolve(user);
                    });
                } catch (error) {
                    reject(NoUserAuthenticatedError);
                }
            } else {
                reject(NoUserAuthenticatedError);
            }
        });
    }

    /**
     * Gets all user permissions.
     *
     * @param {UserModel} user
     * @return {Array}
     * @memberof CurrentUserService
     */
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

    /**
     * Alias to get a user's whois property
     *
     * @param {String} key
     * @return {Mixed}
     * @memberof CurrentUserService
     */
    @action whois(key) {
        return this.getWhoisProperty(key);
    }

    /**
     * Sets a user's option in local storage
     *
     * @param {String} key
     * @param {Mixed} value
     * @return {CurrentUserService}
     */
    @action setOption(key, value) {
        key = `${this.optionsPrefix}${dasherize(key)}`;

        this.options.set(key, value);

        return this;
    }

    /**
     * Retrieves a user option from local storage
     *
     * @param {String} key
     * @return {Mixed}
     */
    @action getOption(key, defaultValue = null) {
        key = `${this.optionsPrefix}${dasherize(key)}`;

        const value = this.options.get(key);
        return value !== undefined ? value : defaultValue;
    }

    /**
     * Retrieves a user option from local storage
     *
     * @param {String} key
     * @return {Mixed}
     */
    @action getWhoisProperty(prop) {
        const whois = this.getOption('whois');

        if (!whois || typeof whois !== 'object') {
            return null;
        }

        return get(whois, prop);
    }

    /**
     * Checks if an option exists in users local storage
     *
     * @param {String} key
     * @return {Boolean}
     */
    @action hasOption(key) {
        return this.getOption(key) !== undefined;
    }

    /**
     * Checks if an option exists in users local storage
     *
     * @param {String} key
     * @return {Boolean}
     */
    @action filledOption(key) {
        return !isBlank(this.getOption(key));
    }
}

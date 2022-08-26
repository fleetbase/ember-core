import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { dasherize } from '@ember/string';
import { computed, get, action } from '@ember/object';
import { alias } from '@ember/object/computed';
import { storageFor } from 'ember-local-storage';

export default class CurrentUserService extends Service {
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
   * Loads the current authenticated user
   *
   * @void
   */
  async load() {
    if (this.session.isAuthenticated) {
      let user = await this.store.queryRecord('user', { me: true });
      this.set('user', user);
    }
  }

  /**
   * Resolves a user model.
   *
   * @return {Promise}
   */
  @action promiseUser(options = {}) {
    const NoUserAuthenticatedError = new Error('Failed to authenticate user.');

    return new Promise((resolve, reject) => {
      if (this.session.isAuthenticated) {
        return this.store
          .queryRecord('user', { me: true })
          .then((user) => {
            // set the `current user`
            this.set('user', user);
            // set environment from user option
            this.theme.setEnvironment();

            // @TODO Create an event dispatch for when an authenticated user is resolved from the server
            if (typeof options?.onUserResolved === 'function') {
              options.onUserResolved(user);
            }

            resolve(user);
          })
          .catch(() => {
            reject(NoUserAuthenticatedError);
          });
      }
    });
  }

  /**
   * Loads and resolved all current users installed order configurations.
   *
   * @return {Promise}
   */
  @action getInstalledOrderConfigs(params = {}) {
    return new Promise((resolve, reject) => {
      this.fetch
        .get('fleet-ops/order-configs/get-installed', params)
        .then((configs) => {
          const serialized = [];

          for (let i = 0; i < configs.length; i++) {
            const config = configs.objectAt(i);
            const normalizedConfig = this.store.normalize(
              'order-config',
              config
            );
            const serializedConfig = this.store.push(normalizedConfig);

            serialized.pushObject(serializedConfig);
          }

          resolve(serialized);
        })
        .catch(reject);
    });
  }

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
  @action getOption(key) {
    key = `${this.optionsPrefix}${dasherize(key)}`;

    return this.options.get(key);
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
}

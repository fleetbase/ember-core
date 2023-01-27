import RESTAdapter from '@ember-data/adapter/rest';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { storageFor } from 'ember-local-storage';
import { get } from '@ember/object';
import { dasherize } from '@ember/string';
import { pluralize } from 'ember-inflector';
import config from 'ember-get-config';

export default class ApplicationAdapter extends RESTAdapter {
  /**
   * Inject the `session` service
   *
   * @var {Service}
   */
  @service session;

  /**
   * Inject the `currentUser` service
   *
   * @var {Service}
   */
  @service currentUser;

  /**
   * User options for setting specific headers
   *
   * @var StorageObject
   */
  @storageFor('user-options') userOptions;

  /**
   * The default namespace for the adapter
   *
   * @var {String}
   */
  get host() {
    return get(config, 'API.host');
  }

  /**
   * The default namespace for adapter
   *
   * @var {String}
   */
  get namespace() {
    return get(config, 'API.namespace');
  }

  /**
   * Credentials
   *
   * @var {String}
   */
  credentials = 'include';

  /**
   * Mutable headers property.
   *
   * @var {Array}
   */
  @tracked _headers;

  /**
   * The headers to send with request.
   *
   * @var {Object}
   */
  get headers() {
    if (this._headers) {
      return this._headers;
    }

    return this.getHeaders();
  }

  /**
   * Setter fucntion to overwrite headers.
   */
  set headers(headers) {
    this._headers = headers;
  }

  /**
   * Gets headers that should be sent with request.
   *
   * @return {Object}
   */
  getHeaders() {
    const headers = {};

    // check if user is authenticated
    const isAuthenticated = this.session.isAuthenticated;

    headers['Content-Type'] = 'application/json';

    if (isAuthenticated) {
      headers[
        'Authorization'
      ] = `Bearer ${this.session.data.authenticated.token}`;
    }

    if (isAuthenticated && this.currentUser.getOption('sandbox') === true) {
      headers['Access-Console-Sandbox'] = true;
    }

    if (isAuthenticated && this.currentUser.hasOption('testKey')) {
      headers['Access-Console-Sandbox-Key'] =
        this.currentUser.getOption('testKey');
    }

    return headers;
  }

  /**
   * Gets fresh headers and sets them.
   *
   * @return {Object}
   */
  refreshHeaders() {
    const headers = this.getHeaders(true);

    this.headers = headers;

    return headers;
  }

  /**
   * Configure AJAX options for request, return as options hash
   *
   * @param {String} url
   * @param {String} type The request type GET, POST, PUT, DELETE etc.
   * @param {Object} options
   *
   * @return {Object}
   */
  ajaxOptions(url, type, options) {
    this.refreshHeaders();

    const ajaxOptions = super.ajaxOptions(url, type, options);
    ajaxOptions.credentials = this.credentials;

    return ajaxOptions;
  }

  /**
   * Dasherize the path for type
   *
   * @param {Object} type
   */
  pathForType(type) {
    return dasherize(pluralize(type));
  }
}
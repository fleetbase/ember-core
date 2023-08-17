import RESTAdapter from '@ember-data/adapter/rest';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { storageFor } from 'ember-local-storage';
import { get } from '@ember/object';
import { isBlank } from '@ember/utils';
import { dasherize } from '@ember/string';
import { pluralize } from 'ember-inflector';
import getUserOptions from '../utils/get-user-options';
import config from 'ember-get-config';

if (isBlank(config.API.host)) {
    config.API.host = `${window.location.protocol}//${window.location.hostname}:8000`;
}

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
    @tracked host;

    /**
     * The default namespace for adapter
     *
     * @var {String}
     */
    @tracked namespace;

    /**
     * Credentials
     *
     * @var {String}
     */
    @tracked credentials = 'include';

    /**
     * Mutable headers property.
     *
     * @var {Array}
     */
    @tracked _headers;

    /**
     * Creates an instance of ApplicationAdapter.
     * @memberof ApplicationAdapter
     */
    constructor() {
        super(...arguments);

        this.host = get(config, 'API.host');
        this.namespace = get(config, 'API.namespace');
        this.headers = this.setupHeaders();
    }

    /**
     * Setup headers that should be sent with request.
     *
     * @return {Object}
     */
    setupHeaders() {
        const headers = {};
        const userId = this.session.data.authenticated.user;
        const userOptions = getUserOptions();
        const isSandbox = get(userOptions, `${userId}:sandbox`) === true;
        const testKey = get(userOptions, `${userId}:testKey`);
        let isAuthenticated = this.session.isAuthenticated;
        let { token } = this.session.data.authenticated;

        // If the session data is not yet available, check localStorage
        if (!isAuthenticated) {
            const localStorageSession = JSON.parse(window.localStorage.getItem('ember_simple_auth-session'));
            if (localStorageSession) {
                const { authenticated } = localStorageSession;
                token = authenticated.token;

                // Check isAuthenticated again
                isAuthenticated = !!token;
            }
        }

        headers['Content-Type'] = 'application/json';

        if (isAuthenticated) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        if (isAuthenticated && isSandbox) {
            headers['Access-Console-Sandbox'] = true;
        }

        if (isAuthenticated && !isBlank(testKey)) {
            headers['Access-Console-Sandbox-Key'] = testKey;
        }

        this.headers = headers;
        return this.headers;
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
        this.setupHeaders();

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

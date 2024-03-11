import RESTAdapter from '@ember-data/adapter/rest';
import AdapterError from '@ember-data/adapter/error';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { storageFor } from 'ember-local-storage';
import { get } from '@ember/object';
import { isBlank } from '@ember/utils';
import { dasherize } from '@ember/string';
import { pluralize } from 'ember-inflector';
import { decompress as decompressJson } from 'compress-json';
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
                if (authenticated) {
                    token = authenticated.token;
                }

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

    /**
     * Handles the response from an AJAX request in an Ember application.
     *
     * @param {number} status - The HTTP status code of the response.
     * @param {object} headers - The headers of the response.
     * @param {object} payload - The payload of the response.
     * @return {Object | AdapterError} response - Returns a new `AdapterError` instance with detailed error information if the response is invalid; otherwise, it returns the result of the superclass's `handleResponse` method.
     *
     * This method first normalizes the error response and generates a detailed message.
     * It then checks if the response is invalid based on the status code. If invalid, it constructs an `AdapterError` with the normalized errors and detailed message.
     * For valid responses, it delegates the handling to the superclass's `handleResponse` method.
     */
    async handleResponse(status, headers, payload, requestData) {
        let decompressedPayload = this.decompressPayload(payload, headers);
        let errors = this.normalizeErrorResponse(status, headers, payload);
        if (this.isInvalid(status, headers, payload)) {
            return new AdapterError(errors);
        }

        return super.handleResponse(status, headers, decompressedPayload, requestData);
    }

    /**
     * Decompresses the response payload if it's marked as compressed in the response headers.
     *
     * This method checks the response headers for a specific 'x-compressed-json' flag.
     * If this flag is set, indicating that the response payload is compressed, the method
     * decompresses the payload. The decompressed payload is then parsed as JSON and returned.
     * If the payload is not compressed, it is returned as is.
     *
     * @param {object} payload - The original payload of the response.
     * @param {object} headers - The headers of the response, used to check if the payload is compressed.
     * @return {object} The decompressed payload if it was compressed, or the original payload otherwise.
     */
    async decompressPayload(payload, headers) {
        // Check if the response is compressed
        if (headers['x-compressed-json'] === '1' || headers['x-compressed-json'] === 1) {
            // Decompress the payload
            const decompressedPayload = decompressJson(payload);
            // Replace payload with decompressed json payload
            payload = JSON.parse(decompressedPayload);
        }

        return payload;
    }
}

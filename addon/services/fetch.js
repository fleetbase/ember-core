import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { get, set, setProperties } from '@ember/object';
import { isBlank } from '@ember/utils';
import { dasherize } from '@ember/string';
import { isArray } from '@ember/array';
import { singularize, pluralize } from 'ember-inflector';
import { task } from 'ember-concurrency';
import { storageFor } from 'ember-local-storage';
import { intervalToDuration, parseISO } from 'date-fns';
import config from 'ember-get-config';
import corslite from '../utils/corslite';
import getMimeType from '../utils/get-mime-type';
import download from '../utils/download';
import fetch from 'fetch';

export default class FetchService extends Service {
  /**
   * The default namespace for the fetch service
   *
   * @var {String}
   */
  get host() {
    if (this._host) {
      return this._host;
    }

    return get(config, 'API.host');
  }

  /**
   * Setter fucntion to overwrite host.
   */
  set host(host) {
    this._host = host;
  }

  /**
   * The default namespace for the fetch service
   *
   * @var {String}
   */
  get namespace() {
    if (this._namespace) {
      return this._namespace;
    }

    return get(config, 'API.namespace');
  }

  /**
   * Setter fucntion to overwrite namespace.
   */
  set namespace(namespace) {
    this._namespace = namespace;
  }

  /**
   * Mutable headers property.
   *
   * @var {Array}
   */
  @tracked _headers;

  /**
   * Mutable namespace property.
   *
   * @var {String}
   */
  @tracked _namespace;

  /**
   * Mutable host property.
   *
   * @var {String}
   */
  @tracked _host;

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

  setNamespace(namespace) {
    this.namespace = namespace;

    return this;
  }

  setHost(host) {
    this.host = host;

    return this;
  }

  /**
   * Credentials
   *
   * @var {String}
   */
  credentials = 'include';

  /**
   * Inject the `store` service
   *
   * @var {Service}
   */
  @service store;

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
   * Inject the `notifications` service
   *
   * @var {Service}
   */
  @service notifications;

  /**
   * Local cache for some static requests
   *
   * @var StorageObject
   */
  @storageFor('local-cache') localCache;

  /**
   * Normalizes a model response from fetch to a ember data model
   *
   * @param  {Object} payload   A response from a network request
   * @param  {String} modelType The type of model to be normalized too
   *
   * @return {Model}            An ember model
   */
  normalizeModel(payload, modelType = null) {
    if (modelType === null) {
      const modelTypeKeys = Object.keys(payload);
      modelType = modelTypeKeys.length ? modelTypeKeys.firstObject : false;
    }

    if (typeof modelType !== 'string') {
      return payload;
    }

    const type = dasherize(singularize(modelType));

    if (isArray(payload)) {
      return payload.map((instance) =>
        this.store.push(this.store.normalize(type, instance))
      );
    }

    if (isArray(payload[modelType])) {
      return payload[modelType].map((instance) =>
        this.store.push(this.store.normalize(type, instance))
      );
    }

    if (!isBlank(payload) && isBlank(payload[modelType])) {
      return this.jsonToModel(payload, type);
    }

    return this.store.push(this.store.normalize(type, payload[modelType]));
  }

  /**
   * Normalizes a model response from a JSON object or string
   *
   * @param  {Object} payload   A response from a network request
   * @param  {String} modelType The type of model to be normalized too
   *
   * @return {Model}            An ember model
   */
  jsonToModel(attributes = {}, modelType) {
    if (typeof attributes === 'string') {
      attributes = JSON.parse(attributes);
    }

    const type = dasherize(modelType);
    const normalized = this.store.push(this.store.normalize(type, attributes));

    return normalized;
  }

  /**
   * Parses the JSON returned by a network request
   *
   * @param  {Object} response A response from a network request
   * @return {Object}          The parsed JSON, status from the response
   *
   * @return {Promise}
   */
  parseJSON(response) {
    return new Promise((resolve, reject) =>
      response
        .json()
        .then((json) =>
          resolve({
            statusText: response.statusText,
            status: response.status,
            ok: response.ok,
            json,
          })
        )
        .catch(() => {
          reject(
            new Error('Oops! Something went wrong when handling your request.')
          );
        })
    );
  }

  // /**
  //  * Request XSRF token from server to use on each subsequent request.
  //  *
  //  * @void
  //  */
  // setupXsrf() {
  //     this.request(`${this.host}/sanctum/csrf-cookie`, 'GET', {}, { externalRequest: true }).then((response) => {
  //         console.log('setupXsrf', response);
  //     });
  // }

  /**
   * The base request method
   *
   * @param {String} path
   * @param {String} method
   * @param {Object} data
   * @param {Object} options
   *
   * @return {Promise}
   */
  request(path, method = 'GET', data = {}, options = {}) {
    this.refreshHeaders();

    return new Promise((resolve, reject) => {
      return fetch(
        options.externalRequest === true
          ? path
          : `${options.host || this.host}/${
              options.namespace || this.namespace
            }/${path}`,
        {
          method,
          mode: options.mode || 'cors',
          credentials: options.credentials || this.credentials,
          headers: {
            ...(this.headers || {}),
            ...(options.headers || {}),
          },
          ...data,
        }
      )
        .then(this.parseJSON)
        .then((response) => {
          // console.log('[fetch:response]', response);
          if (response.ok) {
            if (options.normalizeToEmberData) {
              return resolve(
                this.normalizeModel(response.json, options.normalizeModelType)
              );
            }
            return resolve(response.json);
          }

          if (options.rawError) {
            return reject(response.json);
          }

          if (isArray(response.json.errors)) {
            return reject(
              new Error(
                response.json.errors
                  ? response.json.errors.firstObject
                  : response.statusText
              )
            );
          }

          if (response.json.error && typeof response.json.error) {
            return reject(new Error(response.json.error));
          }

          if (response.json.message && typeof response.json.message) {
            return reject(new Error(response.json.message));
          }

          return reject(response.json);
        })
        .catch(reject);
    });
  }

  /**
   * Makes a GET request with fetch
   *
   * @param {String} path
   * @param {Object} query
   * @param {Object} options
   *
   * @return {Promise}
   */
  get(path, query = {}, options = {}) {
    const urlParams = !isBlank(query)
      ? new URLSearchParams(query).toString()
      : '';

    return this.request(
      `${path}${urlParams ? '?' + urlParams : ''}`,
      'GET',
      {},
      options
    );
  }

  /**
   * Makes a GET request with fetch, but if the fetch is stored in local cache,
   * retrieve from storage to prevent unnecessary netwrok request
   *
   * @param {String} path
   * @param {Object} query
   * @param {Object} options
   *
   * @return {Promise}
   */
  cachedGet(path, query = {}, options = {}) {
    const pathKey = dasherize(path);
    const pathKeyVersion = new Date().toISOString();

    const request = () => {
      return this.get(path, query, options).then((response) => {
        // cache the response
        this.localCache.set(pathKey, response);
        this.localCache.set(`${pathKey}-version`, pathKeyVersion);

        // return response
        return response;
      });
    };

    // check to see if in storage already
    if (this.localCache.get(pathKey)) {
      return new Promise((resolve) => {
        // get cached data
        const data = this.localCache.get(pathKey);

        // get the path key version value
        const version = this.localCache.get(`${pathKey}-version`);
        const expirationInterval = options.expirationInterval ?? 3;
        const expirationIntervalUnit = pluralize(
          options.expirationIntervalUnit ?? 'days'
        );

        // calculate duration between cache version and now
        const duration = intervalToDuration({
          start: parseISO(version),
          end: new Date(),
        });
        // determine if we should expire cache
        const shouldExpire =
          duration[expirationIntervalUnit] > expirationInterval;

        // if the version is older than 3 days clear it
        if (!version || shouldExpire || options.clearData === true) {
          this.flushRequestCache(path);
          return request();
        }

        if (options.normalizeToEmberData) {
          return resolve(this.normalizeModel(data, options.normalizeModelType));
        }

        // return cached response
        return resolve(data);
      });
    }

    // if no cached data request from server
    return request();
  }

  flushRequestCache(path) {
    const pathKey = dasherize(path);

    this.localCache.set(pathKey, undefined);
    this.localCache.set(`${pathKey}-version`, undefined);
  }

  shouldResetCache() {
    const consoleVersion = this.localCache.get('console-version');

    if (!consoleVersion || consoleVersion !== config.APP.version) {
      this.localCache.clear();
      this.localCache.set('console-version', config.APP.version);
    }
  }

  /**
   * Makes a POST request with fetch
   *
   * @param {String} path
   * @param {Object} data
   * @param {Object} options
   *
   * @return {Promise}
   */
  post(path, data = {}, options = {}) {
    return this.request(path, 'POST', { body: JSON.stringify(data) }, options);
  }

  /**
   * Makes a PUT request with fetch
   *
   * @param {String} path
   * @param {Object} data
   * @param {Object} options
   *
   * @return {Promise}
   */
  put(path, data = {}, options = {}) {
    return this.request(path, 'PUT', { body: JSON.stringify(data) }, options);
  }

  /**
   * Makes a DELETE request with fetch
   *
   * @param {String} path
   * @param {Object} data
   * @param {Object} options
   *
   * @return {Promise}
   */
  delete(path, data = {}, options = {}) {
    return this.request(
      path,
      'DELETE',
      { body: JSON.stringify(data) },
      options
    );
  }

  /**
   * Makes a PATCH request with fetch
   * @param {String} path
   * @param {Object} data
   * @param {Object} options
   *
   * @return {Promise}
   */
  patch(path, data = {}, options = {}) {
    return this.request(path, 'PATCH', { body: JSON.stringify(data) }, options);
  }

  /**
   * Makes a upload request with fetch
   *
   * @param {String} path
   * @param {Array} files
   * @param {Object} options
   *
   * @return {Promise}
   */
  upload(path, files = [], options = {}) {
    const body = new FormData();
    files.forEach((file) => {
      body.append('file', file);
    });
    return this.request(path, 'POST', { body }, options);
  }

  /**
   * Sends request to routing service.
   *
   * @param {Array} coordinates
   * @param {Object} query
   * @param {String} service
   * @param {String} profile
   * @param {String} version
   */
  routing(coordinates, query = {}, options = {}) {
    let service = options?.service ?? 'trip';
    let profile = options?.profile ?? 'driving';
    let version = options?.version ?? 'v1';
    let host =
      options?.host ??
      `https://${options?.subdomain ?? 'routing'}.fleetbase.io`;
    let route = coordinates.map((coords) => coords.join(',')).join(';');
    let params = !isBlank(query) ? new URLSearchParams(query).toString() : '';
    let path = `${host}/${service}/${version}/${profile}/${route}`;
    let url = `${path}${params ? '?' + params : ''}`;

    return new Promise((resolve, reject) => {
      corslite(url, (container, xhr) => {
        if (!xhr || !xhr.response) {
          reject(new Error('Request failed.'));
          return;
        }

        let response = xhr.response;
        let isJson = typeof response === 'string' && response.startsWith('{');

        resolve(isJson ? JSON.parse(response) : response);
      });
    });
  }

  /**
   * Concurrency task to handle a file upload
   *
   * @void
   */
  @(task(function* (file, params = {}, callback, errorCallback) {
    this.refreshHeaders();

    const { queue } = file;

    // set some default params from file data
    setProperties(params, {
      file_size: file.size,
    });

    try {
      const upload = yield file.upload(
        `${get(config, 'API.host')}/${get(
          config,
          'API.namespace'
        )}/files/upload`,
        {
          data: params,
          mode: 'cors',
          credentials: this.credentials,
          headers: {
            Authorization: `Bearer ${this.session.data.authenticated.token}`,
          },
        }
      );

      const model = this.store.push(
        this.store.normalize('file', get(upload, 'body.file'))
      );
      set(file, 'model', model);

      if (typeof callback === 'function') {
        callback(model);
      }

      return model;
    } catch (error) {
      queue.remove(file);
      this.notifications.serverError(error, `Upload failed.`);

      if (typeof errorCallback === 'function') {
        errorCallback(error);
      }
    }
  })
    .maxConcurrency(3)
    .enqueue())
  uploadFile;

  /**
   * Downloads blob of the request path to user
   *
   * @param {String} path
   * @param {Object} query
   * @param {Object} options
   *
   * @return {Promise}
   */
  download(path, query = {}, options = {}) {
    this.refreshHeaders();

    return new Promise((resolve, reject) => {
      return fetch(
        `${options.host || this.host}/${
          options.namespace || this.namespace
        }/${path}?${
          !isBlank(query) ? new URLSearchParams(query).toString() : ''
        }`,
        {
          method: 'GET',
          credentials: options.credentials || this.credentials,
          headers: {
            ...(this.headers || {}),
            ...(options.headers || {}),
          },
        }
      )
        .then((response) => {
          options.fileName = this.getFilenameFromResponse(
            response,
            options.fileName
          );
          options.mimeType = this.getMimeTypeFromResponse(
            response,
            options.mimeType
          );

          if (!options.mimeType) {
            options.mimeType = getMimeType(options.fileName);
          }

          return response;
        })
        .then((response) => response.blob())
        .then((blob) =>
          resolve(download(blob, options.fileName, options.mimeType))
        )
        .catch((error) => {
          reject(error);
        });
    });
  }

  getFilenameFromResponse(response, defaultFilename = null) {
    const contentDisposition = response.headers.get('content-disposition');
    let fileName = defaultFilename;

    if (contentDisposition) {
      const results = /filename=(.*)/.exec(contentDisposition);

      if (isArray(results) && results.length > 1) {
        fileName = results[1];

        // clean fileName
        fileName = fileName.replaceAll('"', '');
      }
    }

    return fileName;
  }

  getMimeTypeFromResponse(response, defaultMimeType = null) {
    const contentType = response.headers.get('content-type');
    let mimeType = defaultMimeType;

    if (contentType) {
      const results = /(.*)?;/.exec(contentType);

      if (isArray(results) && results.length > 1) {
        mimeType = results[1];
      }
    }

    return mimeType;
  }

  fetchOrderConfigurations(params = {}) {
    return new Promise((resolve, reject) => {
      this.request('fleet-ops/order-configs/get-installed', params)
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
        .catch((error) => {
          reject(error);
        });
    });
  }
}
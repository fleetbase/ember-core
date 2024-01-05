import Base from 'ember-simple-auth/authenticators/base';
import { inject as service } from '@ember/service';

export default class FleetbaseAuthenticator extends Base {
    /**
     * Inject the `fetch` service
     *
     * @var {Service}
     */
    @service fetch;

    /**
     * Inject the `session` service
     *
     * @var {Service}
     */
    @service session;

    /**
     * Restore session from server
     *
     * @param {object} data
     * @return {Promise}
     */
    restore(data) {
        return this.fetch
            .get(
                'auth/session',
                {},
                {
                    headers: {
                        Authorization: `Bearer ${data.token}`,
                    },
                }
            )
            .then((response) => {
                if (response.restore === false) {
                    return Promise.reject(new Error(response.error));
                }

                return response;
            });
    }

    /**
     * Authenticates a users credentials
     *
     * @param {object} credentials
     * @param {boolean} remember
     * @param {string} path
     */
    authenticate(credentials = {}, remember = false, path = 'auth/login') {
        return this.fetch.post(path, { ...credentials, remember }).then((response) => {
            if (response.errors) {
                return Promise.reject(new Error(response.errors.firstObject ?? 'Authentication failed!'));
            }

            return response;
        });
    }

    /**
     * Invalidates the current session
     *
     * @param {object} data
     */
    // eslint-disable-next-line no-unused-vars
    invalidate(data) {
        return this.fetch.post('auth/logout');
    }
}

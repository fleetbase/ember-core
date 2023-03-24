import EmberNotificationsService from 'ember-cli-notifications/services/notifications';
import { isArray } from '@ember/array';

export default class NotificationsService extends EmberNotificationsService {
    /**
     * Handles errors from the server
     *
     * @param {Error} error
     * @void
     */
    serverError(error, fallbackMessage = 'Oops! Something went wrong with your request.', options) {
        if (isArray(error.errors)) {
            const errorMessage = error.errors.firstObject;

            return this.error(errorMessage ?? fallbackMessage, options);
        }

        if (error instanceof Error) {
            return this.error(error.message ?? fallbackMessage, options);
        }

        return this.error(error ?? fallbackMessage, options);
    }

    invoke(type, message, ...params) {
        if (typeof message === 'function') {
            this[type](message(...params));
        } else {
            this[type](message);
        }
    }
}

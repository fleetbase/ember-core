import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import hasJsonStructure from '../utils/has-json-structure';

export default class UrlSearchParamsService extends Service {
    /**
     * The active URL params
     *
     * @var {Array}
     */
    @tracked urlParams;

    /**
     * Update the URL params
     *
     * @void
     */
    setSearchParams() {
        this.urlParams = new URLSearchParams(window.location.search);

        return this;
    }

    /**
     * Get a param
     *
     * @param {String} key the url param
     * @return mixed
     */
    getParam(key) {
        this.setSearchParams();

        let value = this.urlParams.get(key);

        if (hasJsonStructure(value)) {
            value = JSON.parse(value);
        }

        return value;
    }

    /**
     * Get a param
     *
     * @param {String} key the url param
     * @return mixed
     */
    get(key) {
        return this.getParam(key);
    }

    /**
     * Determines if a queryParam exists
     *
     * @param {String} key the url param
     * @var {Boolean}
     */
    exists(key) {
        this.setSearchParams();

        return this.urlParams.has(key);
    }

    /**
     * Remove a queryparam
     *
     * @param {String} key the url param
     * @void
     */
    remove(key) {
        this.setSearchParams();

        return this.urlParams.delete(key);
    }

    /**
     * Returns object of all params
     *
     * @return {Array}
     */
    all() {
        this.setSearchParams();

        const all = {};

        for (let key of this.urlParams.keys()) {
            all[key] = this.getParam(key);
        }

        return all;
    }
}

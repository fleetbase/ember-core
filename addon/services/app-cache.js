import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { isArray } from '@ember/array';
import { dasherize } from '@ember/string';
import { storageFor } from 'ember-local-storage';
import autoSerialize from '../utils/auto-serialize';

export default class AppCacheService extends Service {
    @service currentUser;
    @service store;
    @storageFor('local-cache') localCache;

    get cachePrefix() {
        const userId = this.currentUser.id ?? 'anon';
        const companyId = this.currentUser.companyId ?? 'no-org';
        return `${userId}:${companyId}:`;
    }

    @action setEmberData(key, value, except = []) {
        value = autoSerialize(value, except);

        return this.set(key, value);
    }

    @action getEmberData(key, modelName) {
        const data = this.get(key);

        if (isArray(data)) {
            return data.map((instance) => this.store.push(this.store.normalize(modelName, instance)));
        }

        return this.store.push(this.store.normalize(modelName, data));
    }

    @action set(key, value) {
        this.localCache.set(`${this.cachePrefix}${dasherize(key)}`, value);

        return this;
    }

    @action get(key, defaultValue = null) {
        const value = this.localCache.get(`${this.cachePrefix}${dasherize(key)}`);
        if (value === undefined) {
            return defaultValue;
        }
        return value;
    }

    // Reads storage directly rather than going through `get`, which substitutes
    // its default for a missing value and so would report every key as present.
    _isStored(key) {
        return this.localCache.get(`${this.cachePrefix}${dasherize(key)}`) !== undefined;
    }

    @action has(key) {
        if (isArray(key)) {
            return key.every((k) => this._isStored(k));
        }

        return this._isStored(key);
    }

    @action doesntHave(key) {
        if (isArray(key)) {
            return key.every((k) => !this._isStored(k));
        }

        return !this._isStored(key);
    }
}

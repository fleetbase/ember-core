import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { isArray } from '@ember/array';
import { isBlank } from '@ember/utils';
import { computed, action, set, get } from '@ember/object';
import { getOwner } from '@ember/application';
import { format } from 'date-fns';

export default class FiltersService extends Service {
    @service router;
    @tracked pendingQueryParams = {};
    @tracked managedQueryParams = ['limit', 'offset', 'sort', 'query', 'page', 'layout', 'view'];

    @computed('pendingQueryParams') get activeFilters() {
        const queryParams = this.getQueryParams();
        const activeQueryParams = [];

        for (let queryParam in queryParams) {
            const value = get(queryParams, queryParam);

            if (isBlank(value) || this.managedQueryParams.includes(queryParam)) {
                continue;
            }

            activeQueryParams.pushObject({ queryParam, label: queryParam, value });
        }

        return activeQueryParams;
    }

    @action set(queryParam, value) {
        if (value instanceof InputEvent) {
            value = value.target.value;
        }

        // special case for status
        if (queryParam === 'status' && value === 'all') {
            value = null;
        }

        if (isArray(value)) {
            value = value
                .filter((value) => !isBlank(value))
                .map((value) => this.serializeQueryParamValue(queryParam, value))
                .join(',');
        } else {
            value = this.serializeQueryParamValue(queryParam, value);
        }

        if (isBlank(value)) {
            return this.clear(queryParam);
        }

        this.pendingQueryParams = {
            ...this.pendingQueryParams,
            [queryParam]: value,
        };
    }

    @action mutate(queryParam, value, controller) {
        this.set(queryParam, value);
        this.apply(controller);
    }

    @action serializeQueryParamValue(queryParam, value) {
        if (value instanceof Date) {
            return format(value, 'yyyy-MM-dd HH:mm');
        }

        return value;
    }

    @action apply(controller) {
        const currentQueryParams = this.getQueryParams();
        const updatableQueryParams = { ...currentQueryParams, ...this.pendingQueryParams };

        for (let queryParam in updatableQueryParams) {
            set(controller, queryParam, get(updatableQueryParams, queryParam));
        }

        // reset pagination to first page
        set(controller, 'page', 1);

        this.notifyPropertyChange('activeFilters');
    }

    @action clear(callback, queryParam = []) {
        const currentQueryParams = this.getQueryParams();
        const callbackIsQp = typeof callback === 'string' || isArray(callback);
        const qpIsCallback = typeof queryParam === 'function' || isBlank(queryParam);

        // handle reversed arguments
        if (callbackIsQp && qpIsCallback) {
            return this.clear(queryParam, callback);
        }

        if (isBlank(queryParam)) {
            return Object.keys(currentQueryParams).forEach((qp) => this.clear(callback, qp));
        }

        if (isArray(queryParam)) {
            return queryParam.forEach((qp) => this.clear(callback, qp));
        }

        if (typeof queryParam !== 'string') {
            return;
        }

        set(this.pendingQueryParams, queryParam, undefined);

        if (typeof callback == 'function') {
            callback(queryParam);
        }

        this.notifyPropertyChange('activeFilters');
    }

    @action removeFromController(controller, queryParam, newValue) {
        if (newValue === undefined) {
            set(controller, queryParam, undefined);
        } else {
            set(controller, queryParam, newValue);
        }
        this.set(queryParam, newValue);
        this.notifyPropertyChange('activeFilters');
    }

    @action lookupCurrentController() {
        const currentRoute = this.lookupCurrentRoute();
        const currentController = currentRoute.controller;

        return currentController;
    }

    @action lookupCurrentRoute() {
        const owner = getOwner(this);
        const currentRouteName = this.router.currentRouteName;
        const currentRoute = owner.lookup(`route:${currentRouteName}`);

        return currentRoute;
    }

    @action getQueryParams() {
        const currentRoute = this.lookupCurrentRoute();
        const currentRouteName = this.router.currentRouteName;
        const routeNameSegments = currentRouteName.split('.');

        for (let i = 0; i < routeNameSegments.length; i++) {
            const path = routeNameSegments.slice(0, routeNameSegments.length - i).join('.');
            const queryParams = currentRoute.paramsFor(path);
            const queryParamKeys = Object.keys(queryParams);

            if (queryParamKeys.length > 0) {
                // strip application managed query params
                const cleanedQueryParams = {};

                for (let i = 0; i < queryParamKeys.length; i++) {
                    const qp = queryParamKeys.objectAt(i);

                    if (this.managedQueryParams.includes(qp)) {
                        continue;
                    }

                    set(cleanedQueryParams, qp, queryParams[qp]);
                }

                return cleanedQueryParams;
            }
        }

        return queryParams;
    }

    @action resetQueryParams() {
        if(!isBlank(this.activeFilters)){
            this.clear();
            this.router.transitionTo({ queryParams: {} });
        }
    }
}

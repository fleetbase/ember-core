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
    @service urlSearchParams;
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
        console.log('FiltersService set()', ...arguments);
        if (value instanceof InputEvent) {
            value = value.target.value;
        }

        // special case for status
        if (queryParam === 'status' && value === 'all') {
            value = null;
        }

        // serialize query param value
        value = this.serializeQueryParamValue(queryParam, value);

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

        if (isArray(value)) {
            return value
                .filter((value) => !isBlank(value))
                .map((value) => this.serializeQueryParamValue(queryParam, value))
                .join(',');
        }

        return value;
    }

    @action apply(controller) {
        const currentQueryParams = this.getQueryParams();
        const updatableQueryParams = { ...currentQueryParams, ...this.pendingQueryParams };

        console.log('apply() #updatableQueryParams', updatableQueryParams);

        for (let queryParam in updatableQueryParams) {
            set(controller, queryParam, get(updatableQueryParams, queryParam));
        }

        // reset pagination to first page
        set(controller, 'page', 1);

        this.notifyPropertyChange('activeFilters');
    }

    @action reset(controller) {
        this.clear((queryParam) => {
            set(controller, queryParam, undefined);
        });
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
        set(controller, queryParam, newValue);

        this.set(queryParam, newValue);
        this.notifyPropertyChange('activeFilters');
    }

    @action lookupCurrentController() {
        const currentRoute = this.lookupCurrentRoute();
        const currentController = currentRoute.controller;

        return currentController;
    }

    @action lookupCurrentRoute() {
        const owner = getOwner(this); // ApplicationInstance
        const router = owner.lookup('router:main'); // Router
        const routerMicrolib = get(router, '_routerMicrolib'); // PrivateRouter
        const currentRouteInfos = get(routerMicrolib, 'currentRouteInfos'); // Array
        const currentRouteInfo = currentRouteInfos[currentRouteInfos.length - 1]; // ResolvedRouteInfo

        return get(currentRouteInfo, '_route');
    }

    @action getRouteQueryParams() {
        const currentRoute = this.lookupCurrentRoute();
        return get(currentRoute, 'queryParams');
    }

    @action getQueryParams() {
        const currentRoute = this.lookupCurrentRoute();
        const currentRouteQueryParams = Object.keys(get(currentRoute, 'queryParams'));
        const queryParams = {};

        for (let i = 0; i < currentRouteQueryParams.length; i++) {
            const queryParam = currentRouteQueryParams.objectAt(i);
            const value = this.urlSearchParams.get(queryParam);

            if (this.managedQueryParams.includes(queryParam)) {
                continue;
            }

            if (value) {
                queryParams[queryParam] = value;
            }
        }

        return queryParams;
    }

    @action resetQueryParams() {
        if (!isBlank(this.activeFilters)) {
            this.clear();
            this.router.transitionTo({ queryParams: {} });
        }
    }
}

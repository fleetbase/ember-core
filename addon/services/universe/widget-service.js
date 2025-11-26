import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A, isArray } from '@ember/array';
import Widget from '../../contracts/widget';

/**
 * WidgetService
 * 
 * Manages dashboard widgets and widget registrations.
 * 
 * @class WidgetService
 * @extends Service
 */
export default class WidgetService extends Service {
    @service('universe/registry-service') registryService;

    @tracked defaultWidgets = A([]);
    @tracked widgets = A([]);
    @tracked dashboards = A([]);

    /**
     * Register default dashboard widgets
     * These widgets are automatically added to new dashboards
     * 
     * @method registerDefaultDashboardWidgets
     * @param {Array<Widget>} widgets Array of widget instances or objects
     */
    registerDefaultDashboardWidgets(widgets) {
        if (!isArray(widgets)) {
            widgets = [widgets];
        }

        widgets.forEach(widget => {
            const normalized = this._normalizeWidget(widget);
            this.defaultWidgets.pushObject(normalized);
            this.registryService.register('widget', `default:${normalized.widgetId}`, normalized);
        });
    }

    /**
     * Register dashboard widgets
     * 
     * @method registerDashboardWidgets
     * @param {Array<Widget>} widgets Array of widget instances or objects
     */
    registerDashboardWidgets(widgets) {
        if (!isArray(widgets)) {
            widgets = [widgets];
        }

        widgets.forEach(widget => {
            const normalized = this._normalizeWidget(widget);
            this.widgets.pushObject(normalized);
            this.registryService.register('widget', normalized.widgetId, normalized);
        });
    }

    /**
     * Register a dashboard
     * 
     * @method registerDashboard
     * @param {String} name Dashboard name
     * @param {Object} options Dashboard options
     */
    registerDashboard(name, options = {}) {
        const dashboard = {
            name,
            ...options
        };

        this.dashboards.pushObject(dashboard);
        this.registryService.register('dashboard', name, dashboard);
    }

    /**
     * Get default widgets
     * 
     * @method getDefaultWidgets
     * @returns {Array} Default widgets
     */
    getDefaultWidgets() {
        return this.defaultWidgets;
    }

    /**
     * Get all widgets
     * 
     * @method getWidgets
     * @returns {Array} All widgets
     */
    getWidgets() {
        return this.widgets;
    }

    /**
     * Get a specific widget by ID
     * 
     * @method getWidget
     * @param {String} widgetId Widget ID
     * @returns {Object|null} Widget or null
     */
    getWidget(widgetId) {
        return this.registryService.lookup('widget', widgetId);
    }

    /**
     * Get all dashboards
     * 
     * @method getDashboards
     * @returns {Array} All dashboards
     */
    getDashboards() {
        return this.dashboards;
    }

    /**
     * Get a specific dashboard
     * 
     * @method getDashboard
     * @param {String} name Dashboard name
     * @returns {Object|null} Dashboard or null
     */
    getDashboard(name) {
        return this.registryService.lookup('dashboard', name);
    }

    /**
     * Get widgets for a specific dashboard or category
     * 
     * @method getWidgets
     * @param {String} category Optional category (e.g., 'dashboard')
     * @returns {Array} Widgets for the category
     */
    getWidgets(category = null) {
        if (!category) {
            return this.widgets;
        }
        
        // For 'dashboard' category, return all widgets
        if (category === 'dashboard') {
            return this.widgets;
        }
        
        // Filter widgets by category
        return this.widgets.filter(w => w.category === category);
    }

    /**
     * Get registry for a specific dashboard
     * Used by dashboard models to get their widget registry
     * 
     * @method getRegistry
     * @param {String} dashboardId Dashboard ID
     * @returns {Array} Widget registry for the dashboard
     */
    getRegistry(dashboardId) {
        // Return the widget registry for this dashboard
        // This is used by the Dashboard model's getRegistry method
        return this.registryService.getRegistry(`widget#${dashboardId}`);
    }

    /**
     * Register default widgets
     * Alias for registerDefaultDashboardWidgets
     * 
     * @method registerDefaultWidgets
     * @param {Array<Widget>} widgets Array of widget instances
     */
    registerDefaultWidgets(widgets) {
        return this.registerDefaultDashboardWidgets(widgets);
    }

    /**
     * Register widgets to a specific category
     * 
     * @method registerWidgets
     * @param {String} category Category name
     * @param {Array<Widget>} widgets Array of widget instances
     */
    registerWidgets(category, widgets) {
        if (!isArray(widgets)) {
            widgets = [widgets];
        }

        widgets.forEach(widget => {
            const normalized = this._normalizeWidget(widget);
            normalized.category = category;
            this.widgets.pushObject(normalized);
            this.registryService.register('widget', `${category}#${normalized.widgetId}`, normalized);
        });
    }

    /**
     * Normalize a widget input to a plain object
     * 
     * @private
     * @method _normalizeWidget
     * @param {Widget|Object} input Widget instance or object
     * @returns {Object} Normalized widget object
     */
    _normalizeWidget(input) {
        if (input instanceof Widget) {
            return input.toObject();
        }

        return input;
    }
}

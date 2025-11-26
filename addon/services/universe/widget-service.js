import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { A, isArray } from '@ember/array';
import Widget from '../../contracts/widget';
import isObject from '../../utils/is-object';

/**
 * WidgetService
 * 
 * Manages dashboard widgets and widget registrations.
 * 
 * Widgets are registered per-dashboard:
 * - registerWidgets(dashboardName, widgets) - Makes widgets available for selection on a dashboard
 * - registerDefaultWidgets(dashboardName, widgets) - Auto-loads specific widgets on a dashboard
 * 
 * @class WidgetService
 * @extends Service
 */
export default class WidgetService extends Service {
    @service('universe/registry-service') registryService;

    @tracked dashboards = A([]);

    /**
     * Normalize a widget input to a plain object
     * 
     * @private
     * @method #normalizeWidget
     * @param {Widget|Object} input Widget instance or object
     * @returns {Object} Normalized widget object
     */
    #normalizeWidget(input) {
        if (input instanceof Widget) {
            return input.toObject();
        }

        // Handle plain objects - ensure id property exists
        if (isObject(input)) {
            // Support both id and widgetId for backward compatibility
            const id = input.id || input.widgetId;
            
            if (!id) {
                console.warn('[WidgetService] Widget definition is missing id or widgetId:', input);
            }
            
            return {
                ...input,
                id  // Ensure id property is set
            };
        }

        return input;
    }

    /**
     * Register a dashboard
     * 
     * @method registerDashboard
     * @param {String} name Dashboard name/ID
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
     * Register widgets to a specific dashboard
     * Makes these widgets available for selection on the dashboard
     * If a widget has `default: true`, it's also registered as a default widget
     * 
     * @method registerWidgets
     * @param {String} dashboardName Dashboard name/ID
     * @param {Array<Widget>} widgets Array of widget instances or objects
     */
    registerWidgets(dashboardName, widgets) {
        if (!isArray(widgets)) {
            widgets = [widgets];
        }

        widgets.forEach(widget => {
            const normalized = this.#normalizeWidget(widget);
            
            // Register widget to dashboard-specific registry
            // Format: widget:dashboardName#widgetId
            this.registryService.register('widget', `${dashboardName}#${normalized.id}`, normalized);
            
            // If marked as default, also register to default widgets
            if (normalized.default === true) {
                this.registryService.register('widget', `default#${dashboardName}#${normalized.id}`, normalized);
            }
        });
    }

    /**
     * Register default widgets for a specific dashboard
     * These widgets are automatically loaded on the dashboard
     * 
     * @method registerDefaultWidgets
     * @param {String} dashboardName Dashboard name/ID
     * @param {Array<Widget>} widgets Array of widget instances or objects
     */
    registerDefaultWidgets(dashboardName, widgets) {
        console.log('[WidgetService] registerDefaultWidgets called:', { dashboardName, widgets });
        
        if (!isArray(widgets)) {
            widgets = [widgets];
        }

        widgets.forEach(widget => {
            const normalized = this.#normalizeWidget(widget);
            console.log('[WidgetService] Normalized widget:', normalized);
            console.log('[WidgetService] Registering with key:', `default#${dashboardName}#${normalized.id}`);
            
            // Register to default widgets registry for this dashboard
            // Format: widget:default#dashboardName#widgetId
            this.registryService.register('widget', `default#${dashboardName}#${normalized.id}`, normalized);
        });
        
        console.log('[WidgetService] Registration complete. Checking registry...');
        const registry = this.registryService.getRegistry('widget');
        console.log('[WidgetService] Widget registry after registration:', registry);
    }

    /**
     * Get widgets for a specific dashboard
     * Returns all widgets available for selection on that dashboard
     * 
     * @method getWidgets
     * @param {String} dashboardName Dashboard name/ID
     * @returns {Array} Widgets available for the dashboard
     */
    getWidgets(dashboardName) {
        if (!dashboardName) {
            return [];
        }
        
        // Get all widgets registered to this dashboard
        const registry = this.registryService.getRegistry('widget');
        const prefix = `${dashboardName}#`;
        
        return Object.keys(registry)
            .filter(key => key.startsWith(prefix))
            .map(key => registry[key]);
    }

    /**
     * Get default widgets for a specific dashboard
     * Returns widgets that should be auto-loaded
     * 
     * @method getDefaultWidgets
     * @param {String} dashboardName Dashboard name/ID
     * @returns {Array} Default widgets for the dashboard
     */
    getDefaultWidgets(dashboardName) {
        console.log('[WidgetService] getDefaultWidgets called for:', dashboardName);
        
        if (!dashboardName) {
            console.log('[WidgetService] No dashboardName provided, returning empty array');
            return [];
        }
        
        // Get all default widgets for this dashboard
        const registry = this.registryService.getRegistry('widget');
        console.log('[WidgetService] Full widget registry:', registry);
        
        const prefix = `default#${dashboardName}#`;
        console.log('[WidgetService] Looking for keys with prefix:', prefix);
        
        const keys = Object.keys(registry);
        console.log('[WidgetService] All registry keys:', keys);
        
        const matchingKeys = keys.filter(key => key.startsWith(prefix));
        console.log('[WidgetService] Matching keys:', matchingKeys);
        
        const widgets = matchingKeys.map(key => registry[key]);
        console.log('[WidgetService] Returning widgets:', widgets);
        
        return widgets;
    }

    /**
     * Get a specific widget by ID from a dashboard
     * 
     * @method getWidget
     * @param {String} dashboardName Dashboard name/ID
     * @param {String} widgetId Widget ID
     * @returns {Object|null} Widget or null
     */
    getWidget(dashboardName, widgetId) {
        return this.registryService.lookup('widget', `${dashboardName}#${widgetId}`);
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
     * Get registry for a specific dashboard
     * Used by dashboard models to get their widget registry
     * 
     * @method getRegistry
     * @param {String} dashboardId Dashboard ID
     * @returns {Array} Widget registry for the dashboard
     */
    getRegistry(dashboardId) {
        return this.getWidgets(dashboardId);
    }



    // ============================================================================
    // DEPRECATED METHODS (for backward compatibility)
    // ============================================================================

    /**
     * Register default dashboard widgets
     * DEPRECATED: Use registerDefaultWidgets(dashboardName, widgets) instead
     * 
     * @method registerDefaultDashboardWidgets
     * @param {Array<Widget>} widgets Array of widget instances or objects
     * @deprecated Use registerDefaultWidgets('dashboard', widgets) instead
     */
    registerDefaultDashboardWidgets(widgets) {
        console.warn('[WidgetService] registerDefaultDashboardWidgets is deprecated. Use registerDefaultWidgets(dashboardName, widgets) instead.');
        this.registerDefaultWidgets('dashboard', widgets);
    }

    /**
     * Register dashboard widgets
     * DEPRECATED: Use registerWidgets(dashboardName, widgets) instead
     * 
     * @method registerDashboardWidgets
     * @param {Array<Widget>} widgets Array of widget instances or objects
     * @deprecated Use registerWidgets('dashboard', widgets) instead
     */
    registerDashboardWidgets(widgets) {
        console.warn('[WidgetService] registerDashboardWidgets is deprecated. Use registerWidgets(dashboardName, widgets) instead.');
        this.registerWidgets('dashboard', widgets);
    }
}

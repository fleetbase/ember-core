import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { warn } from '@ember/debug';
import { isArray } from '@ember/array';
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
 * Registry Structure:
 * - Dashboards: 'dashboards' section, 'dashboard' list
 * - Widgets: 'dashboard:widgets' section, 'widget' list
 * - Default Widgets: 'dashboard:widgets' section, 'default-widget' list
 * 
 * @class WidgetService
 * @extends Service
 */
export default class WidgetService extends Service {
    @service('universe/registry-service') registryService;

    /**
     * Set the application instance (for consistency with other services)
     * 
     * @method setApplicationInstance
     * @param {Application} application The root application instance
     */
    setApplicationInstance(application) {
        // WidgetService doesn't currently need applicationInstance
        // but we provide this method for consistency
    }

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
                warn('[WidgetService] Widget definition is missing id or widgetId', { id: 'widget-service.missing-id' });
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

        // Register to 'dashboards' section, 'dashboard' list
        this.registryService.register('dashboards', 'dashboard', name, dashboard);
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
            
            // Register widget to 'dashboard:widgets' section, 'widget' list
            // Key format: dashboardName#widgetId
            this.registryService.register(
                'dashboard:widgets', 
                'widget', 
                `${dashboardName}#${normalized.id}`, 
                normalized
            );
            
            // If marked as default, also register to default widget list
            if (normalized.default === true) {
                this.registryService.register(
                    'dashboard:widgets', 
                    'default-widget', 
                    `${dashboardName}#${normalized.id}`, 
                    normalized
                );
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
        if (!isArray(widgets)) {
            widgets = [widgets];
        }

        widgets.forEach(widget => {
            const normalized = this.#normalizeWidget(widget);
            
            // Register to 'dashboard:widgets' section, 'default-widget' list
            // Key format: dashboardName#widgetId
            this.registryService.register(
                'dashboard:widgets', 
                'default-widget', 
                `${dashboardName}#${normalized.id}`, 
                normalized
            );
        });
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
        
        // Get all widgets from 'dashboard:widgets' section, 'widget' list
        const registry = this.registryService.getRegistry('dashboard:widgets', 'widget');
        
        // Filter widgets by registration key prefix
        const prefix = `${dashboardName}#`;
        
        return registry.filter(widget => {
            if (!widget || typeof widget !== 'object') return false;
            
            // Match widgets registered for this dashboard
            return widget._registryKey && widget._registryKey.startsWith(prefix);
        });
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
        if (!dashboardName) {
            return [];
        }
        
        // Get all default widgets from 'dashboard:widgets' section, 'default-widget' list
        const registry = this.registryService.getRegistry('dashboard:widgets', 'default-widget');
        
        // Filter widgets by registration key prefix
        const prefix = `${dashboardName}#`;
        
        return registry.filter(widget => {
            if (!widget || typeof widget !== 'object') return false;
            
            // Match default widgets registered for this dashboard
            return widget._registryKey && widget._registryKey.startsWith(prefix);
        });
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
        return this.registryService.lookup(
            'dashboard:widgets', 
            'widget', 
            `${dashboardName}#${widgetId}`
        );
    }

    /**
     * Get all dashboards
     * 
     * @method getDashboards
     * @returns {Array} All dashboards
     */
    getDashboards() {
        return this.registryService.getRegistry('dashboards', 'dashboard');
    }

    /**
     * Get a specific dashboard
     * 
     * @method getDashboard
     * @param {String} name Dashboard name
     * @returns {Object|null} Dashboard or null
     */
    getDashboard(name) {
        return this.registryService.lookup('dashboards', 'dashboard', name);
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
        warn('[WidgetService] registerDefaultDashboardWidgets is deprecated. Use registerDefaultWidgets(dashboardName, widgets) instead.', { id: 'widget-service.deprecated-method' });
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
        warn('[WidgetService] registerDashboardWidgets is deprecated. Use registerWidgets(dashboardName, widgets) instead.', { id: 'widget-service.deprecated-method' });
        this.registerWidgets('dashboard', widgets);
    }
}

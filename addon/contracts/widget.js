import BaseContract from './base-contract';
import ExtensionComponent from './extension-component';

/**
 * Represents a dashboard widget
 * 
 * Widgets are modular components that can be added to dashboards.
 * They support grid layout options, custom configurations, and lazy-loaded components.
 * 
 * @class Widget
 * @extends BaseContract
 * 
 * @example
 * // With chaining
 * new Widget('fleet-ops-metrics')
 *   .withName('Fleet-Ops Metrics')
 *   .withDescription('Key metrics from Fleet-Ops')
 *   .withIcon('truck')
 *   .withComponent(new ExtensionComponent('@fleetbase/fleetops-engine', 'components/widget/metrics'))
 *   .withGridOptions({ w: 12, h: 12, minW: 8, minH: 12 })
 *   .asDefault()
 * 
 * @example
 * // Full definition object (first-class)
 * new Widget({
 *   widgetId: 'fleet-ops-metrics',
 *   name: 'Fleet-Ops Metrics',
 *   description: 'Key metrics from Fleet-Ops',
 *   icon: 'truck',
 *   component: { engine: '@fleetbase/fleetops-engine', path: 'components/widget/metrics' },
 *   grid_options: { w: 12, h: 12, minW: 8, minH: 12 },
 *   default: true
 * })
 */
export default class Widget extends BaseContract {
    /**
     * Create a new Widget
     * 
     * @constructor
     * @param {String|Object} widgetIdOrDefinition Unique widget identifier or full definition object
     */
    constructor(widgetIdOrDefinition) {
        // Handle full definition object as first-class
        if (typeof widgetIdOrDefinition === 'object' && widgetIdOrDefinition !== null) {
            const definition = widgetIdOrDefinition;
            super(definition);
            
            this.widgetId = definition.widgetId;
            this.name = definition.name || null;
            this.description = definition.description || null;
            this.icon = definition.icon || null;
            this.component = definition.component || null;
            this.grid_options = definition.grid_options || {};
            this.options = definition.options || {};
            this.category = definition.category || 'default';
            
            if (definition.default) {
                this._options.default = true;
            }
        } else {
            // Handle string widgetId (chaining pattern)
            super({ widgetId: widgetIdOrDefinition });
            
            this.widgetId = widgetIdOrDefinition;
            this.name = null;
            this.description = null;
            this.icon = null;
            this.component = null;
            this.grid_options = {};
            this.options = {};
            this.category = 'default';
        }
    }

    /**
     * Validate the widget
     * 
     * @method validate
     * @throws {Error} If widgetId is missing
     */
    validate() {
        if (!this.widgetId) {
            throw new Error('Widget requires a widgetId');
        }
    }

    /**
     * Set the widget name
     * 
     * @method withName
     * @param {String} name Display name
     * @returns {Widget} This instance for chaining
     */
    withName(name) {
        this.name = name;
        this._options.name = name;
        return this;
    }

    /**
     * Set the widget description
     * 
     * @method withDescription
     * @param {String} description Widget description
     * @returns {Widget} This instance for chaining
     */
    withDescription(description) {
        this.description = description;
        this._options.description = description;
        return this;
    }

    /**
     * Set the widget icon
     * 
     * @method withIcon
     * @param {String} icon Icon name
     * @returns {Widget} This instance for chaining
     */
    withIcon(icon) {
        this.icon = icon;
        this._options.icon = icon;
        return this;
    }

    /**
     * Set the widget component
     * 
     * @method withComponent
     * @param {ExtensionComponent|Object} component Component definition
     * @returns {Widget} This instance for chaining
     */
    withComponent(component) {
        if (component instanceof ExtensionComponent) {
            this.component = component.toObject();
        } else {
            this.component = component;
        }
        this._options.component = this.component;
        return this;
    }

    /**
     * Set grid layout options
     * 
     * @method withGridOptions
     * @param {Object} options Grid options (w, h, minW, minH, etc.)
     * @returns {Widget} This instance for chaining
     */
    withGridOptions(options) {
        this.grid_options = { ...this.grid_options, ...options };
        this._options.grid_options = this.grid_options;
        return this;
    }

    /**
     * Set widget-specific options
     * 
     * @method withOptions
     * @param {Object} options Widget options
     * @returns {Widget} This instance for chaining
     */
    withOptions(options) {
        this.options = { ...this.options, ...options };
        this._options.options = this.options;
        return this;
    }

    /**
     * Set the widget category
     * 
     * @method withCategory
     * @param {String} category Category name
     * @returns {Widget} This instance for chaining
     */
    withCategory(category) {
        this.category = category;
        this._options.category = category;
        return this;
    }

    /**
     * Mark this widget as a default widget
     * Default widgets are automatically added to new dashboards
     * 
     * @method asDefault
     * @returns {Widget} This instance for chaining
     */
    asDefault() {
        this._options.default = true;
        return this;
    }

    /**
     * Set the widget title
     * 
     * @method withTitle
     * @param {String} title Widget title
     * @returns {Widget} This instance for chaining
     */
    withTitle(title) {
        if (!this.options) {
            this.options = {};
        }
        this.options.title = title;
        this._options.options = this.options;
        return this;
    }

    /**
     * Set refresh interval for the widget
     * 
     * @method withRefreshInterval
     * @param {Number} milliseconds Refresh interval in milliseconds
     * @returns {Widget} This instance for chaining
     */
    withRefreshInterval(milliseconds) {
        if (!this.options) {
            this.options = {};
        }
        this.options.refreshInterval = milliseconds;
        this._options.options = this.options;
        return this;
    }

    /**
     * Get the plain object representation
     * 
     * @method toObject
     * @returns {Object} Plain object with all widget properties
     */
    toObject() {
        return {
            widgetId: this.widgetId,
            name: this.name,
            description: this.description,
            icon: this.icon,
            component: this.component,
            grid_options: this.grid_options,
            options: this.options,
            category: this.category,
            ...this._options
        };
    }
}

import BaseContract from './base-contract';
import ExtensionComponent from './extension-component';
import isObject from '../utils/is-object';

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
 *   id: 'fleet-ops-metrics',
 *   name: 'Fleet-Ops Metrics',
 *   description: 'Key metrics from Fleet-Ops',
 *   icon: 'truck',
 *   component: new ExtensionComponent('@fleetbase/fleetops-engine', 'components/widget/metrics'),
 *   grid_options: { w: 12, h: 12, minW: 8, minH: 12 },
 *   default: true
 * })
 * 
 * @example
 * // Full definition with string component (local)
 * new Widget({
 *   id: 'welcome',
 *   name: 'Welcome',
 *   component: 'widget/welcome',
 *   default: true
 * })
 */
export default class Widget extends BaseContract {
    /**
     * Create a new Widget
     * 
     * @constructor
     * @param {String|Object} idOrDefinition Unique widget identifier or full definition object
     */
    constructor(idOrDefinition) {
        // Call super FIRST (JavaScript requirement)
        super(isObject(idOrDefinition) ? idOrDefinition : { id: idOrDefinition });
        
        // THEN set properties
        if (isObject(idOrDefinition)) {
            const definition = idOrDefinition;
            
            this.id = definition.id;
            this.name = definition.name || null;
            this.description = definition.description || null;
            this.icon = definition.icon || null;
            this.grid_options = definition.grid_options || {};
            this.options = definition.options || {};
            this.category = definition.category || 'default';
            
            // Handle component - support both string and ExtensionComponent
            if (definition.component instanceof ExtensionComponent) {
                this.component = definition.component.toObject();
            } else if (isObject(definition.component)) {
                // Plain object component definition
                this.component = definition.component;
            } else {
                // String component path
                this.component = definition.component || null;
            }
            
            // Store default flag if present
            if (definition.default) {
                this._options.default = true;
            }
        } else {
            // Handle string id (chaining pattern)
            this.id = idOrDefinition;
            this.name = null;
            this.description = null;
            this.icon = null;
            this.component = null;
            this.grid_options = {};
            this.options = {};
            this.category = 'default';
        }
        
        // Call setup() to trigger validation after properties are set
        super.setup();
    }

    /**
     * Validate the widget
     * 
     * @method validate
     * @throws {Error} If id is missing
     */
    validate() {
        if (!this.id) {
            throw new Error('Widget requires an id');
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
     * Supports both string paths and ExtensionComponent instances
     * 
     * @method withComponent
     * @param {String|ExtensionComponent|Object} component Component definition
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
     * Check if this widget is marked as default
     * 
     * @method isDefault
     * @returns {Boolean} True if widget is a default widget
     */
    isDefault() {
        return this._options.default === true;
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
            id: this.id,
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

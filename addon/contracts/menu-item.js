import BaseContract from './base-contract';
import ExtensionComponent from './extension-component';
import { dasherize } from '@ember/string';
import { isArray } from '@ember/array';
import isObject from '../utils/is-object';

/**
 * Represents a menu item in the application
 *
 * Menu items can be simple navigation links or complex interactive components.
 * They support routing, icons, priorities, click handlers, and lazy-loaded components.
 *
 * @class MenuItem
 * @extends BaseContract
 *
 * @example
 * // Simple menu item with chaining
 * new MenuItem('Fleet-Ops', 'console.fleet-ops')
 *   .withIcon('route')
 *   .withPriority(0)
 *
 * @example
 * // Full definition object (first-class)
 * new MenuItem({
 *   title: 'Fleet-Ops',
 *   route: 'console.fleet-ops',
 *   icon: 'route',
 *   priority: 0,
 *   component: { engine: '@fleetbase/fleetops-engine', path: 'components/admin/navigator-app' }
 * })
 *
 * @example
 * // Menu item with component
 * new MenuItem('Settings')
 *   .withComponent(new ExtensionComponent('@fleetbase/my-engine', 'components/settings'))
 *   .onClick((menuItem, router) => {
 *     router.transitionTo('virtual', menuItem.slug);
 *   })
 *
 * @example
 * // Menu item with description and shortcuts (Phase 2)
 * new MenuItem('Fleet-Ops', 'console.fleet-ops')
 *   .withIcon('route')
 *   .withDescription('Manage fleets, drivers, and live orders')
 *   .withShortcuts([
 *     { title: 'Scheduler', route: 'console.fleet-ops.scheduler', icon: 'calendar' },
 *     { title: 'Order Config', route: 'console.fleet-ops.order-configs', icon: 'gear' },
 *   ])
 */
export default class MenuItem extends BaseContract {
    /**
     * Create a new MenuItem
     *
     * @constructor
     * @param {String|Object} titleOrDefinition The menu item title or full definition object
     * @param {String} route Optional route name (only used if first param is string)
     */
    constructor(titleOrDefinition, route = null) {
        // Call super FIRST (JavaScript requirement)
        super(isObject(titleOrDefinition) ? titleOrDefinition : { title: titleOrDefinition, route });

        // THEN set properties
        if (isObject(titleOrDefinition)) {
            const definition = titleOrDefinition;

            // Core properties
            this.title = definition.title || null;
            this.text = definition.text || definition.title;
            this.label = definition.label || definition.title;
            this.id = definition.id || (definition.title ? dasherize(definition.title) : null);
            this.slug = definition.slug || (this.title ? dasherize(this.title) : null);

            // Routing properties
            this.route = definition.route || null;
            this.section = definition.section || null;
            this.queryParams = definition.queryParams || {};
            this.routeParams = definition.routeParams || [];
            this.view = definition.view || (this.title ? dasherize(this.title) : null);

            // Display properties
            this.icon = definition.icon || 'circle-dot';
            this.iconComponent = definition.iconComponent || null;
            this.iconComponentOptions = definition.iconComponentOptions || {};
            this.iconSize = definition.iconSize || null;
            this.iconPrefix = definition.iconPrefix || null;
            this.iconClass = definition.iconClass || null;

            // Component properties
            this.component = definition.component || null;
            this.componentParams = definition.componentParams || {};
            this.renderComponentInPlace = definition.renderComponentInPlace || false;

            // Styling properties
            this.class = definition.class || null;
            this.inlineClass = definition.inlineClass || null;
            this.wrapperClass = definition.wrapperClass || null;
            this.overwriteWrapperClass = definition.overwriteWrapperClass || false;

            // Behavior properties
            this.priority = definition.priority !== undefined ? definition.priority : 9;
            this.index = definition.index !== undefined ? definition.index : 0;
            this.type = definition.type || 'default';
            this.buttonType = definition.buttonType || null;
            this.onClick = definition.onClick || null;

            // State properties
            this.disabled = definition.disabled || false;
            this.isLoading = definition.isLoading || false;

            // Permission and i18n
            this.permission = definition.permission || null;
            this.intl = definition.intl || null;

            // Nested items
            this.items = definition.items || null;

            // ── Phase 2 additions ──────────────────────────────────────────
            // A short human-readable description of the extension shown in the
            // overflow dropdown.  Optional – defaults to null.
            this.description = definition.description || null;

            // An array of shortcut items (sub-menu links) displayed beneath the
            // extension name in the multi-column dropdown.  Each shortcut is a
            // plain object with at minimum { title, route } and optionally
            // { icon, iconPrefix, id }.  Optional – defaults to null.
            this.shortcuts = definition.shortcuts || null;

            // An array of string tags used to improve search discoverability in
            // the overflow dropdown.  e.g. ['logistics', 'tracking', 'fleet'].
            // Optional – defaults to null.
            this.tags = isArray(definition.tags) ? definition.tags : (definition.tags ? [definition.tags] : null);
        } else {
            // Handle string title with optional route (chaining pattern)
            this.title = titleOrDefinition;
            this.text = titleOrDefinition;
            this.label = titleOrDefinition;
            this.id = dasherize(titleOrDefinition);
            this.slug = dasherize(titleOrDefinition);

            // Routing properties
            this.route = route;
            this.section = null;
            this.queryParams = {};
            this.routeParams = [];
            this.view = dasherize(titleOrDefinition);

            // Display properties
            this.icon = 'circle-dot';
            this.iconComponent = null;
            this.iconComponentOptions = {};
            this.iconSize = null;
            this.iconPrefix = null;
            this.iconClass = null;

            // Component properties
            this.component = null;
            this.componentParams = {};
            this.renderComponentInPlace = false;

            // Styling properties
            this.class = null;
            this.inlineClass = null;
            this.wrapperClass = null;
            this.overwriteWrapperClass = false;

            // Behavior properties
            this.priority = 9;
            this.index = 0;
            this.type = 'default';
            this.buttonType = null;
            this.onClick = null;

            // State properties
            this.disabled = false;
            this.isLoading = false;

            // Permission and i18n
            this.permission = null;
            this.intl = null;

            // Nested items
            this.items = null;

            // ── Phase 2 additions ──────────────────────────────────────────
            this.description = null;
            this.shortcuts = null;
            this.tags = null;
        }

        // Call setup() to trigger validation after properties are set
        super.setup();
    }

    /**
     * Validate the menu item
     *
     * @method validate
     * @throws {Error} If title is missing
     */
    validate() {
        if (!this.title) {
            throw new Error('MenuItem requires a title');
        }
    }

    /**
     * Set the menu item icon
     *
     * @method withIcon
     * @param {String} icon Icon name (FontAwesome or custom)
     * @returns {MenuItem} This instance for chaining
     */
    withIcon(icon) {
        this.icon = icon;
        this._options.icon = icon;
        return this;
    }

    /**
     * Set the menu item priority
     * Lower numbers appear first in the menu
     *
     * @method withPriority
     * @param {Number} priority Priority value (default: 9)
     * @returns {MenuItem} This instance for chaining
     */
    withPriority(priority) {
        this.priority = priority;
        this._options.priority = priority;
        return this;
    }

    /**
     * Set a component for the menu item
     *
     * @method withComponent
     * @param {ExtensionComponent|Object} component Component definition
     * @returns {MenuItem} This instance for chaining
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
     * Set a click handler for the menu item
     *
     * @method onClick
     * @param {Function} handler Click handler function
     * @returns {MenuItem} This instance for chaining
     */
    onClick(handler) {
        this._options.onClick = handler;
        return this;
    }

    /**
     * Set the menu item slug
     *
     * @method withSlug
     * @param {String} slug URL-friendly slug
     * @returns {MenuItem} This instance for chaining
     */
    withSlug(slug) {
        this.slug = slug;
        this._options.slug = slug;
        return this;
    }

    /**
     * Set query parameters for the route
     *
     * @method withQueryParams
     * @param {Object} params Query parameters object
     * @returns {MenuItem} This instance for chaining
     */
    withQueryParams(params) {
        this.queryParams = params;
        this._options.queryParams = params;
        return this;
    }

    /**
     * Set route parameters
     *
     * @method withRouteParams
     * @param {...*} params Route parameters
     * @returns {MenuItem} This instance for chaining
     */
    withRouteParams(...params) {
        this.routeParams = params;
        this._options.routeParams = params;
        return this;
    }

    /**
     * Set the section this menu item belongs to
     *
     * @method inSection
     * @param {String} section Section name
     * @returns {MenuItem} This instance for chaining
     */
    inSection(section) {
        this.section = section;
        this._options.section = section;
        return this;
    }

    /**
     * Set the index position within its section
     *
     * @method atIndex
     * @param {Number} index Index position
     * @returns {MenuItem} This instance for chaining
     */
    atIndex(index) {
        this.index = index;
        this._options.index = index;
        return this;
    }

    /**
     * Set the menu item type
     *
     * @method withType
     * @param {String} type Type (e.g., 'link', 'button', 'default')
     * @returns {MenuItem} This instance for chaining
     */
    withType(type) {
        this.type = type;
        this._options.type = type;
        return this;
    }

    /**
     * Set wrapper CSS class
     *
     * @method withWrapperClass
     * @param {String} wrapperClass CSS class for wrapper element
     * @returns {MenuItem} This instance for chaining
     */
    withWrapperClass(wrapperClass) {
        this.wrapperClass = wrapperClass;
        this._options.wrapperClass = wrapperClass;
        return this;
    }

    /**
     * Set component parameters
     *
     * @method withComponentParams
     * @param {Object} params Parameters to pass to component
     * @returns {MenuItem} This instance for chaining
     */
    withComponentParams(params) {
        this._options.componentParams = params;
        return this;
    }

    /**
     * Set whether to render component in place
     *
     * @method renderInPlace
     * @param {Boolean} inPlace Whether to render in place
     * @returns {MenuItem} This instance for chaining
     */
    renderInPlace(inPlace = true) {
        this._options.renderComponentInPlace = inPlace;
        return this;
    }

    // ── Phase 2 builder methods ────────────────────────────────────────────

    /**
     * Set a short human-readable description for the extension.
     * Displayed beneath the extension title in the overflow dropdown.
     *
     * @method withDescription
     * @param {String} description Short description text
     * @returns {MenuItem} This instance for chaining
     *
     * @example
     * new MenuItem('Fleet-Ops', 'console.fleet-ops')
     *   .withDescription('Manage fleets, drivers, and live orders')
     */
    withDescription(description) {
        this.description = description;
        this._options.description = description;
        return this;
    }

    /**
     * Set an array of shortcut items displayed as independent sibling cards in
     * the multi-column overflow dropdown (AWS Console style).  Each shortcut
     * supports the full MenuItem property surface:
     *
     *   Required:
     *     title    {String}   Display label
     *
     *   Routing:
     *     route    {String}   Ember route name
     *     queryParams {Object}
     *     routeParams {Array}
     *
     *   Identity:
     *     id       {String}   Explicit id (auto-dasherized from title if omitted)
     *     slug     {String}   URL slug (falls back to id)
     *
     *   Icons:
     *     icon            {String}   FontAwesome icon name
     *     iconPrefix      {String}   FA prefix (e.g. 'far', 'fab')
     *     iconSize        {String}   FA size string
     *     iconClass       {String}   Extra CSS class on the icon element
     *     iconComponent   {String}   Lazy-loaded engine component path
     *     iconComponentOptions {Object}
     *
     *   Metadata:
     *     description {String}   Short description shown in the card
     *     tags        {String[]} Search tags
     *
     *   Behaviour:
     *     onClick  {Function}  Click handler (receives the shortcut item)
     *     disabled {Boolean}
     *
     * Shortcuts are registered as first-class header menu items at boot time
     * and can be individually pinned to the navigation bar.
     *
     * @method withShortcuts
     * @param {Array<Object>} shortcuts Array of shortcut definition objects
     * @returns {MenuItem} This instance for chaining
     *
     * @example
     * new MenuItem('Fleet-Ops', 'console.fleet-ops')
     *   .withShortcuts([
     *     {
     *       title: 'Scheduler',
     *       route: 'console.fleet-ops.scheduler',
     *       icon: 'calendar',
     *       description: 'Plan and visualise driver schedules',
     *       tags: ['schedule', 'calendar'],
     *     },
     *     {
     *       title: 'Live Map',
     *       route: 'console.fleet-ops',
     *       iconComponent: 'fleet-ops@components/live-map-icon',
     *       description: 'Real-time vehicle tracking',
     *     },
     *   ])
     */
    withShortcuts(shortcuts) {
        this.shortcuts = isArray(shortcuts) ? shortcuts : null;
        this._options.shortcuts = this.shortcuts;
        return this;
    }

    /**
     * Set an array of string tags for this menu item.
     * Tags are matched against the search query in the overflow dropdown,
     * making items discoverable even when the query doesn't match the title
     * or description.
     *
     * @method withTags
     * @param {String|String[]} tags One tag string or an array of tag strings
     * @returns {MenuItem} This instance for chaining
     *
     * @example
     * new MenuItem('Fleet-Ops', 'console.fleet-ops')
     *   .withTags(['logistics', 'tracking', 'fleet', 'drivers'])
     */
    withTags(tags) {
        this.tags = isArray(tags) ? tags : (tags ? [tags] : null);
        this._options.tags = this.tags;
        return this;
    }

    /**
     * Add a single shortcut to the existing shortcuts array.
     * Creates the array if it does not yet exist.
     *
     * @method addShortcut
     * @param {Object} shortcut Shortcut definition object { title, route, icon?, iconPrefix?, id? }
     * @returns {MenuItem} This instance for chaining
     *
     * @example
     * new MenuItem('Fleet-Ops', 'console.fleet-ops')
     *   .addShortcut({ title: 'Scheduler', route: 'console.fleet-ops.scheduler' })
     *   .addShortcut({ title: 'Order Config', route: 'console.fleet-ops.order-configs' })
     */
    addShortcut(shortcut) {
        if (!isArray(this.shortcuts)) {
            this.shortcuts = [];
        }
        this.shortcuts = [...this.shortcuts, shortcut];
        this._options.shortcuts = this.shortcuts;
        return this;
    }

    /**
     * Get the plain object representation
     *
     * @method toObject
     * @returns {Object} Plain object with all menu item properties
     */
    toObject() {
        return {
            // Core properties
            id: this.id,
            title: this.title,
            text: this.text,
            label: this.label,
            slug: this.slug,

            // Routing properties
            route: this.route,
            section: this.section,
            view: this.view,
            queryParams: this.queryParams,
            routeParams: this.routeParams,

            // Display properties
            icon: this.icon,
            iconComponent: this.iconComponent,
            iconComponentOptions: this.iconComponentOptions,
            iconSize: this.iconSize,
            iconPrefix: this.iconPrefix,
            iconClass: this.iconClass,

            // Component properties
            component: this.component,
            componentParams: this.componentParams,
            renderComponentInPlace: this.renderComponentInPlace,

            // Styling properties
            class: this.class,
            inlineClass: this.inlineClass,
            wrapperClass: this.wrapperClass,
            overwriteWrapperClass: this.overwriteWrapperClass,

            // Behavior properties
            priority: this.priority,
            index: this.index,
            type: this.type,
            buttonType: this.buttonType,
            onClick: this.onClick,

            // State properties
            disabled: this.disabled,
            isLoading: this.isLoading,

            // Permission and i18n
            permission: this.permission,
            intl: this.intl,

            // Nested items
            items: this.items,

            // ── Phase 2 additions ──────────────────────────────────────────
            // Optional short description shown in the overflow dropdown card
            description: this.description,

            // Optional array of shortcut sub-links shown inside the extension card
            shortcuts: this.shortcuts,

            // Optional array of string tags for search discoverability
            tags: this.tags,

            // Indicator flag
            _isMenuItem: true,

            // Include any additional options
            ...this._options,
        };
    }
}

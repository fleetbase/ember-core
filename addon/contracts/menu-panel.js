import BaseContract from './base-contract';
import MenuItem from './menu-item';
import { dasherize } from '@ember/string';

/**
 * Represents a menu panel containing multiple menu items
 * 
 * Menu panels are used in admin settings and other sections to group related menu items.
 * 
 * @class MenuPanel
 * @extends BaseContract
 * 
 * @example
 * new MenuPanel('Fleet-Ops Config')
 *   .withSlug('fleet-ops')
 *   .withIcon('truck')
 *   .addItem(new MenuItem('Navigator App').withIcon('location-arrow'))
 *   .addItem(new MenuItem('Avatar Management').withIcon('images'))
 */
export default class MenuPanel extends BaseContract {
    /**
     * Create a new MenuPanel
     * 
     * @constructor
     * @param {String} title The panel title
     * @param {Array} items Optional array of menu items
     */
    constructor(title, items = []) {
        super({ title });
        
        this.title = title;
        this.items = items;
        this.slug = dasherize(title);
        this.icon = null;
        this.priority = 9;
    }

    /**
     * Validate the menu panel
     * 
     * @method validate
     * @throws {Error} If title is missing
     */
    validate() {
        if (!this.title) {
            throw new Error('MenuPanel requires a title');
        }
    }

    /**
     * Set the panel slug
     * 
     * @method withSlug
     * @param {String} slug URL-friendly slug
     * @returns {MenuPanel} This instance for chaining
     */
    withSlug(slug) {
        this.slug = slug;
        this._options.slug = slug;
        return this;
    }

    /**
     * Set the panel icon
     * 
     * @method withIcon
     * @param {String} icon Icon name
     * @returns {MenuPanel} This instance for chaining
     */
    withIcon(icon) {
        this.icon = icon;
        this._options.icon = icon;
        return this;
    }

    /**
     * Set the panel priority
     * 
     * @method withPriority
     * @param {Number} priority Priority value
     * @returns {MenuPanel} This instance for chaining
     */
    withPriority(priority) {
        this.priority = priority;
        this._options.priority = priority;
        return this;
    }

    /**
     * Add a menu item to the panel
     * 
     * @method addItem
     * @param {MenuItem|Object} item Menu item to add
     * @returns {MenuPanel} This instance for chaining
     */
    addItem(item) {
        if (item instanceof MenuItem) {
            this.items.push(item.toObject());
        } else {
            this.items.push(item);
        }
        return this;
    }

    /**
     * Add multiple menu items to the panel
     * 
     * @method addItems
     * @param {Array} items Array of menu items
     * @returns {MenuPanel} This instance for chaining
     */
    addItems(items) {
        items.forEach(item => this.addItem(item));
        return this;
    }

    /**
     * Get the plain object representation
     * 
     * @method toObject
     * @returns {Object} Plain object with all panel properties
     */
    toObject() {
        return {
            title: this.title,
            slug: this.slug,
            icon: this.icon,
            priority: this.priority,
            items: this.items,
            ...this._options
        };
    }
}

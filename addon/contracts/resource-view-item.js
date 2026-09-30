import BaseContract from './base-contract';
import isObject from '../utils/is-object';

/**
 * Base class for everything an extension adds to a table or details view:
 * columns, dropdown actions and header buttons.
 *
 * Holds what they share: a required `id` (the dedupe key, and the anchor other
 * items place themselves against), placement (`before`, `after`, `index`,
 * `priority`) and `permission`. Every other key in the definition is kept, so
 * a subclass never has to list the keys the renderers read.
 *
 * @class ResourceViewItem
 * @extends BaseContract
 */
export default class ResourceViewItem extends BaseContract {
    /**
     * The registry list this contract is stored in. Set by each subclass.
     *
     * @type {String}
     */
    static contractType = null;

    constructor(definition = {}) {
        super(isObject(definition) ? definition : {});
        this.setup();
    }

    get contractType() {
        return this.constructor.contractType;
    }

    get id() {
        return this.getOption('id');
    }

    validate() {
        if (!this.id) {
            throw new Error(`${this.constructor.name} requires an id`);
        }
    }

    /**
     * Place this item directly before the sibling with the given id.
     *
     * @param {String} id
     * @returns {ResourceViewItem}
     */
    before(id) {
        return this.removeOption('after').setOption('before', id);
    }

    /**
     * Place this item directly after the sibling with the given id.
     *
     * @param {String} id
     * @returns {ResourceViewItem}
     */
    after(id) {
        return this.removeOption('before').setOption('after', id);
    }

    withIndex(index) {
        return this.setOption('index', index);
    }

    withPriority(priority) {
        return this.setOption('priority', priority);
    }

    withPermission(permission) {
        return this.setOption('permission', permission);
    }

    toObject() {
        return { ...this._options, _contractType: this.contractType };
    }
}

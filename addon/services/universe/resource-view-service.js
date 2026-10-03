import Service, { inject as service } from '@ember/service';
import { warn } from '@ember/debug';
import { isArray } from '@ember/array';
import { getOwner } from '@ember/application';
import mergeRegisteredItems from '../../utils/merge-registered-items';
import isObject from '../../utils/is-object';
import { parseRegistryName, parseRegistryPrefix, buildRegistryName, resourceRegistryNames } from '../../utils/resource-view-registry';

/**
 * ResourceViewService
 *
 * Lets extensions add columns, actions and buttons to the table and details
 * views of any engine, and lets those views merge them in.
 *
 * Registry names follow `<extension>:<resource>:<surface>:<slot>`:
 *
 * | surface   | slot           | adds                                     | contract         |
 * |-----------|----------------|------------------------------------------|------------------|
 * | `table`   | `columns`      | table columns                            | `TableColumn`    |
 * | `table`   | `row-actions`  | items in each row's dropdown             | `ResourceAction` |
 * | `table`   | `bulk-actions` | items in the Bulk Actions dropdown       | `ResourceAction` |
 * | `table`   | `actions`      | toolbar buttons                          | `ActionButton`   |
 * | `details` | `actions`      | details header buttons                   | `ActionButton`   |
 * | `details` | `menu`         | items in the details header's "…" menu   | `ResourceAction` |
 * | `details` | `tabs`         | details tabs                             | `MenuItem`       |
 *
 * Items are stored in the shared universe registry: the section is the full
 * registry name and the list is the contract type, e.g.
 * `registryService.getRegistry('fleet-ops:driver:table:columns', 'table-column')`.
 * Tabs are the exception: `<extension>:<resource>:details:tabs` is an alias for the
 * legacy tab registry, `<extension>:component:<resource>:details`.
 *
 * @example
 * const views = universe.getService('resource-view');
 * views.register('fleet-ops:driver:table:row-actions', new ResourceAction({ id: 'acme-sync', label: 'Sync', fn: (driver) => … }));
 * views.registerTableColumn('ledger', 'invoice', new TableColumn({ id: 'po', label: 'PO', valuePath: 'meta.po' }));
 *
 * @class ResourceViewService
 * @extends Service
 */
export default class ResourceViewService extends Service {
    @service('universe/registry-service') registryService;
    @service('universe/menu-service') menuService;

    /**
     * Views whose query params were already read by a controller. A filter
     * column registered for one of these afterwards cannot get its param.
     */
    #resolvedQueryParams = new Set();

    // ========================================================================
    // Naming
    // ========================================================================

    /**
     * Every registry name for one resource's table and details views.
     *
     * @param {String} extension
     * @param {String} resource
     * @returns {Array<String>}
     */
    resourceRegistryNames(extension, resource) {
        return resourceRegistryNames(extension, resource);
    }

    /**
     * Declare the registries for resources an engine owns, so they exist (and
     * show up in the registry) before anything registers into them.
     *
     * @param {String} extension The owning engine's mount segment
     * @param {Array<String>} resources
     * @returns {Array<String>} The declared names
     */
    declare(extension, resources = []) {
        const names = resources.flatMap((resource) => resourceRegistryNames(extension, resource));
        names.forEach((name) => {
            const { section, list } = parseRegistryName(name);
            this.registryService.getOrCreateList(section, list);
        });
        return names;
    }

    // ========================================================================
    // Registering
    // ========================================================================

    /**
     * Register one or more items into a view slot.
     *
     * Rejects, with a warning, a name that does not follow the convention, an
     * item without an `id`, and a contract that does not belong in the slot.
     *
     * @param {String} registryName e.g. `fleet-ops:driver:table:columns`
     * @param {Object|Array} items Contracts or plain objects
     * @returns {Boolean} Whether every item was registered
     */
    register(registryName, items) {
        const parsed = parseRegistryName(registryName);
        if (!parsed) {
            warn(`[resource-view] "${registryName}" is not a valid registry name. Use <extension>:<resource>:<table|details>:<slot>.`, false, {
                id: 'resource-view.invalid-name',
            });
            return false;
        }

        return (isArray(items) ? items : [items]).map((item) => this.#registerItem(parsed, item)).every(Boolean);
    }

    registerTableColumn(extension, resource, column) {
        return this.register(buildRegistryName(extension, resource, 'table', 'columns'), column);
    }

    registerRowAction(extension, resource, action) {
        return this.register(buildRegistryName(extension, resource, 'table', 'row-actions'), action);
    }

    registerBulkAction(extension, resource, action) {
        return this.register(buildRegistryName(extension, resource, 'table', 'bulk-actions'), action);
    }

    registerTableAction(extension, resource, button) {
        return this.register(buildRegistryName(extension, resource, 'table', 'actions'), button);
    }

    registerDetailsAction(extension, resource, button) {
        return this.register(buildRegistryName(extension, resource, 'details', 'actions'), button);
    }

    registerDetailsMenuItem(extension, resource, action) {
        return this.register(buildRegistryName(extension, resource, 'details', 'menu'), action);
    }

    /**
     * Register a details tab, through `<extension>:<resource>:details:tabs`, the
     * alias for `<extension>:component:<resource>:details`.
     *
     * @returns {Boolean}
     */
    registerDetailsTab(extension, resource, menuItem) {
        return this.register(buildRegistryName(extension, resource, 'details', 'tabs'), menuItem);
    }

    /**
     * Remove a registered item.
     *
     * @param {String} registryName
     * @param {String} id
     * @returns {Boolean} Whether an item was removed
     */
    unregister(registryName, id) {
        const parsed = parseRegistryName(registryName);
        if (!parsed) {
            return false;
        }

        const item = this.registryService.lookup(parsed.section, parsed.list, id);
        if (!item) {
            return false;
        }

        this.registryService.getRegistry(parsed.section, parsed.list).removeObject(item);
        return true;
    }

    // ========================================================================
    // Reading
    // ========================================================================

    /**
     * The items registered into a slot, in registration order.
     *
     * @param {String} registryName
     * @returns {Array}
     */
    get(registryName) {
        const parsed = parseRegistryName(registryName);
        return parsed ? this.registryService.getRegistry(parsed.section, parsed.list) : [];
    }

    /**
     * Merge a slot's registered items into a view's built-in items. See
     * `utils/merge-registered-items` for placement and handler binding.
     *
     * @param {String} registryName
     * @param {Array} baseItems
     * @param {Object} context Extra view context (`resource`, `controller`, `table`, …)
     * @returns {Array}
     */
    merge(registryName, baseItems = [], context = {}) {
        const parsed = parseRegistryName(registryName);
        if (!parsed) {
            return toPlainArray(baseItems);
        }

        const registered = this.get(registryName);
        if (!registered.length) {
            return toPlainArray(baseItems);
        }

        return mergeRegisteredItems(baseItems, registered, {
            slot: parsed.slot,
            context: this.#buildContext(parsed, context),
            canAccess: (permission) => this.#can(permission),
        });
    }

    /**
     * Merge one slot of a surface, addressed by the `@registry` prefix a layout
     * component receives (`fleet-ops:driver:table`) plus the slot name.
     *
     * @param {String} prefix
     * @param {String} slot
     * @param {Array} baseItems
     * @param {Object} context
     * @returns {Array}
     */
    mergeSlot(prefix, slot, baseItems = [], context = {}) {
        const parsed = parseRegistryPrefix(prefix);
        if (!parsed) {
            return toPlainArray(baseItems);
        }

        return this.merge(`${prefix}:${slot}`, baseItems, context);
    }

    /**
     * A table's row-actions column with registered row actions merged into its
     * `actions`. Returns the column list unchanged when nothing is registered.
     *
     * @param {String} prefix A table prefix, e.g. `fleet-ops:driver:table`
     * @param {Array} columns
     * @param {Object} context
     * @returns {Array}
     */
    mergeRowActions(prefix, columns = [], context = {}) {
        const registryName = `${prefix}:row-actions`;
        if (!parseRegistryName(registryName) || !this.get(registryName).length) {
            return toPlainArray(columns);
        }

        return toPlainArray(columns).map((column) => {
            if (column?.cellComponent !== 'table/cell/dropdown') {
                return column;
            }

            return { ...column, actions: this.merge(registryName, column.actions ?? [], context) };
        });
    }

    // ========================================================================
    // Filters
    // ========================================================================

    /**
     * The query params an index controller must declare: its own, plus the
     * `filterParam` of every filterable registered column.
     *
     * Call it from the controller's `queryParams` class field. Filter columns
     * must therefore be registered in `setupExtension`, before the controller
     * is first created.
     *
     * @param {String} extension
     * @param {String} resource
     * @param {Array} baseQueryParams
     * @returns {Array}
     */
    queryParamsFor(extension, resource, baseQueryParams = []) {
        const registryName = buildRegistryName(extension, resource, 'table', 'columns');
        this.#resolvedQueryParams.add(registryName);

        const queryParams = [...baseQueryParams];
        for (const param of this.get(registryName).map(filterParamOf).filter(Boolean)) {
            if (!queryParams.includes(param)) {
                queryParams.push(param);
            }
        }

        return queryParams;
    }

    // ========================================================================
    // Internals
    // ========================================================================

    #registerItem(parsed, item) {
        // Tabs go to the legacy tab registry, through the menu service, which keys and
        // wraps menu items as every other tab registration expects.
        if (parsed.slot === 'tabs') {
            if (!isObject(item)) {
                warn(`[resource-view] Tabs registered into "${parsed.name}" must be MenuItems or menu item objects.`, false, { id: 'resource-view.invalid-tab' });
                return false;
            }

            this.menuService.registerMenuItem(parsed.section, item);
            return true;
        }

        const value = normalizeItem(item);

        if (!value || !value.id) {
            warn(`[resource-view] Items registered into "${parsed.name}" need an id.`, false, { id: 'resource-view.missing-id' });
            return false;
        }

        if (value._contractType && value._contractType !== parsed.list) {
            warn(`[resource-view] "${value.id}" is a ${value._contractType}, but "${parsed.name}" holds ${parsed.list} items.`, false, {
                id: 'resource-view.wrong-contract',
            });
            return false;
        }

        if (parsed.slot === 'columns' && filterParamOf(value) && this.#resolvedQueryParams.has(parsed.name)) {
            warn(
                `[resource-view] The filter "${value.filterParam}" on "${value.id}" was registered after its table was set up, so it is not a query param. Register filter columns in setupExtension.`,
                false,
                { id: 'resource-view.late-filter' }
            );
        }

        this.registryService.register(parsed.section, parsed.list, value.id, { ...value, _contractType: parsed.list });
        return true;
    }

    #buildContext(parsed, context) {
        const base = {
            registry: parsed.name,
            extension: parsed.extension,
            surface: parsed.surface,
            resourceName: parsed.resource,
            slot: parsed.slot,
            owner: getOwner(this),
        };

        // Copy descriptors rather than spreading: a view may pass lazy getters
        // (its table is set up after first render), and a spread would read
        // them now, during the render that merges.
        return Object.defineProperties(base, Object.getOwnPropertyDescriptors(context));
    }

    #can(permission) {
        const abilities = getOwner(this)?.lookup('service:abilities');
        return !abilities || typeof abilities.can !== 'function' || abilities.can(permission);
    }
}

function normalizeItem(item) {
    if (item && typeof item.toObject === 'function') {
        return item.toObject();
    }

    return isObject(item) ? { ...item } : null;
}

function filterParamOf(column) {
    return column?.filterable && typeof column.filterParam === 'string' ? column.filterParam : null;
}

function toPlainArray(items) {
    if (!items) {
        return [];
    }

    return typeof items.toArray === 'function' ? items.toArray() : Array.from(items);
}

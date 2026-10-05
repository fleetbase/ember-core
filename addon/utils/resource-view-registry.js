/**
 * Naming rules for the resource view registries.
 *
 * Every table and details view slot an extension can add to is named
 *
 *     <extension>:<resource>:<surface>:<slot>
 *
 * - `extension` is the engine that owns the view, and always equals its
 *   console mount segment (`console.fleet-ops` → `fleet-ops`).
 * - `resource` is the singular, dasherized resource without an engine prefix
 *   (`invoice`, not `ledger-invoice`).
 * - `surface` is `table` or `details`.
 * - `slot` comes from a fixed vocabulary per surface. `actions` always means
 *   header buttons; dropdown items are `row-actions`, `bulk-actions` or `menu`.
 *
 * Details tabs predate this convention and live in
 * `<extension>:component:<resource>:details`. `<extension>:<resource>:details:tabs`
 * is an alias for that registry: both names reach the same tabs.
 *
 * @example
 * 'fleet-ops:driver:table:columns'
 * 'ledger:invoice:details:menu'
 * 'fleet-ops:driver:details:tabs' // → fleet-ops:component:driver:details
 */

export const SURFACE_SLOTS = {
    table: ['columns', 'row-actions', 'bulk-actions', 'actions'],
    details: ['actions', 'menu', 'tabs'],
};

/** The registry list each slot stores into, named after the contract it holds. */
export const SLOT_LISTS = {
    columns: 'table-column',
    'row-actions': 'action',
    'bulk-actions': 'action',
    menu: 'action',
    actions: 'action-button',
    tabs: 'menu-item',
};

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const NAME_PATTERN = new RegExp(`^(${SEGMENT}):(${SEGMENT}):(table|details):([a-z]+(?:-[a-z]+)*)$`);
const PREFIX_PATTERN = new RegExp(`^(${SEGMENT}):(${SEGMENT}):(table|details)$`);

/**
 * Parse a full registry name. Returns `null` for anything that does not follow
 * the convention, including an unknown surface or a slot the surface lacks.
 *
 * `section` and `list` say where the slot's items are stored. For every slot
 * but `tabs` that is the name itself; tabs are stored in the legacy tab registry.
 *
 * @param {String} name
 * @returns {{name: String, prefix: String, extension: String, resource: String, surface: String, slot: String, section: String, list: String}|null}
 */
export function parseRegistryName(name) {
    if (typeof name !== 'string') {
        return null;
    }

    const match = name.match(NAME_PATTERN);
    if (!match) {
        return null;
    }

    const [, extension, resource, surface, slot] = match;
    if (!SURFACE_SLOTS[surface].includes(slot)) {
        return null;
    }

    const section = slot === 'tabs' ? detailsTabsRegistryName(extension, resource) : name;
    return { name, prefix: `${extension}:${resource}:${surface}`, extension, resource, surface, slot, section, list: SLOT_LISTS[slot] };
}

/**
 * Parse a surface prefix such as `fleet-ops:driver:table`, the form layout
 * components take as `@registry`.
 *
 * @param {String} prefix
 * @returns {{prefix: String, extension: String, resource: String, surface: String}|null}
 */
export function parseRegistryPrefix(prefix) {
    if (typeof prefix !== 'string') {
        return null;
    }

    const match = prefix.match(PREFIX_PATTERN);
    if (!match) {
        return null;
    }

    const [, extension, resource, surface] = match;
    return { prefix, extension, resource, surface };
}

/**
 * Build a full registry name from its segments, in the order they appear.
 *
 * @returns {String}
 */
export function buildRegistryName(extension, resource, surface, slot) {
    return `${extension}:${resource}:${surface}:${slot}`;
}

/**
 * Every registry name for one resource's table and details views, including
 * the details tabs alias.
 *
 * @param {String} extension
 * @param {String} resource
 * @returns {Array<String>}
 */
export function resourceRegistryNames(extension, resource) {
    return Object.entries(SURFACE_SLOTS).flatMap(([surface, slots]) => slots.map((slot) => buildRegistryName(extension, resource, surface, slot)));
}

/**
 * The legacy details-tab registry for a resource. Tabs predate the convention
 * and keep their original name so existing registrations keep working;
 * `<extension>:<resource>:details:tabs` is an alias for it.
 *
 * @returns {String}
 */
export function detailsTabsRegistryName(extension, resource) {
    return `${extension}:component:${resource}:details`;
}

export default parseRegistryName;

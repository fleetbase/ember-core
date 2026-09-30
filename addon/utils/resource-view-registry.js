/**
 * Naming rules for the resource view registries.
 *
 * Every table and details view slot an extension can add to is named
 *
 *     <extension>:<surface>:<resource>:<slot>
 *
 * - `extension` is the engine that owns the view, and always equals its
 *   console mount segment (`console.fleet-ops` → `fleet-ops`).
 * - `surface` is `table` or `details`.
 * - `resource` is the singular, dasherized resource without an engine prefix
 *   (`invoice`, not `ledger-invoice`).
 * - `slot` comes from a fixed vocabulary per surface. `actions` always means
 *   header buttons; dropdown items are `row-actions`, `bulk-actions` or `menu`.
 *
 * @example
 * 'fleet-ops:table:driver:columns'
 * 'ledger:details:invoice:menu'
 */

export const SURFACE_SLOTS = {
    table: ['columns', 'row-actions', 'bulk-actions', 'actions'],
    details: ['actions', 'menu'],
};

/** The registry list each slot stores into, named after the contract it holds. */
export const SLOT_LISTS = {
    columns: 'table-column',
    'row-actions': 'action',
    'bulk-actions': 'action',
    menu: 'action',
    actions: 'action-button',
};

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const NAME_PATTERN = new RegExp(`^(${SEGMENT}):(table|details):(${SEGMENT}):([a-z]+(?:-[a-z]+)*)$`);
const PREFIX_PATTERN = new RegExp(`^(${SEGMENT}):(table|details):(${SEGMENT})$`);

/**
 * Parse a full registry name. Returns `null` for anything that does not follow
 * the convention, including an unknown surface or a slot the surface lacks.
 *
 * @param {String} name
 * @returns {{name: String, prefix: String, extension: String, surface: String, resource: String, slot: String, list: String}|null}
 */
export function parseRegistryName(name) {
    if (typeof name !== 'string') {
        return null;
    }

    const match = name.match(NAME_PATTERN);
    if (!match) {
        return null;
    }

    const [, extension, surface, resource, slot] = match;
    if (!SURFACE_SLOTS[surface].includes(slot)) {
        return null;
    }

    return { name, prefix: `${extension}:${surface}:${resource}`, extension, surface, resource, slot, list: SLOT_LISTS[slot] };
}

/**
 * Parse a surface prefix such as `fleet-ops:table:driver`, the form layout
 * components take as `@registry`.
 *
 * @param {String} prefix
 * @returns {{prefix: String, extension: String, surface: String, resource: String}|null}
 */
export function parseRegistryPrefix(prefix) {
    if (typeof prefix !== 'string') {
        return null;
    }

    const match = prefix.match(PREFIX_PATTERN);
    if (!match) {
        return null;
    }

    const [, extension, surface, resource] = match;
    return { prefix, extension, surface, resource };
}

/**
 * Build a full registry name from its segments.
 *
 * @returns {String}
 */
export function buildRegistryName(extension, surface, resource, slot) {
    return `${extension}:${surface}:${resource}:${slot}`;
}

/**
 * Every registry name for one resource's table and details views.
 *
 * @param {String} extension
 * @param {String} resource
 * @returns {Array<String>}
 */
export function resourceRegistryNames(extension, resource) {
    return Object.entries(SURFACE_SLOTS).flatMap(([surface, slots]) => slots.map((slot) => buildRegistryName(extension, surface, resource, slot)));
}

/**
 * The legacy details-tab registry for a resource. Tabs predate the convention
 * and keep their original name so existing registrations keep working.
 *
 * @returns {String}
 */
export function detailsTabsRegistryName(extension, resource) {
    return `${extension}:component:${resource}:details`;
}

export default parseRegistryName;

import { debug } from '@ember/debug';

/**
 * Merge the items extensions registered into a view slot with the view's own
 * built-in items.
 *
 * - Built-ins win: a registered item whose `id` matches a built-in is dropped.
 * - Registered items are placed in `priority` order (lowest first), each at its
 *   `before`/`after` anchor, else at `index`, else at the slot's default spot:
 *   columns go just before the row-actions column, `row-actions` and `menu`
 *   items go before the delete action, and everything else is appended.
 * - Every registered item is a fresh copy, so a consumer that mutates what it
 *   renders (the column picker sets `hidden`) never touches the registry.
 * - Handlers are bound to the view context: an action's `fn(target)` and
 *   `isVisible(target)` become `fn(target, ctx)` and `isVisible(target, ctx)`, a
 *   bulk action's target is the selection at click time (`ctx.getSelectedRows()`), a
 *   button's `onClick()` becomes `onClick(ctx)`, and a button's `isVisible(ctx)`
 *   is evaluated here, so hidden buttons are left out entirely.
 *
 * Pure: neither input is modified.
 *
 * @param {Array} baseItems The view's built-in items
 * @param {Array} registeredItems The items registered for this slot
 * @param {Object} options
 * @param {String} options.slot The slot being merged (`columns`, `row-actions`, …)
 * @param {Object} options.context The view context passed to handlers
 * @param {Function} options.canAccess `(permission) => Boolean`; registered columns failing it are left out
 * @returns {Array}
 */
export default function mergeRegisteredItems(baseItems = [], registeredItems = [], { slot = null, context = {}, canAccess = null } = {}) {
    const result = [...toArray(baseItems)];
    const takenIds = new Set(result.map((item) => item?.id).filter(Boolean));

    const registered = toArray(registeredItems)
        .map((item, order) => ({ item, order }))
        .sort((a, b) => priorityOf(a.item) - priorityOf(b.item) || a.order - b.order)
        .map(({ item }) => item);

    for (const item of registered) {
        if (!item || !item.id) {
            continue;
        }

        if (takenIds.has(item.id)) {
            debug(`[resource-view] "${item.id}" is already in the ${slot ?? 'view'} slot; the registered item was skipped.`);
            continue;
        }

        if (slot === 'columns' && item.permission && typeof canAccess === 'function' && !canAccess(item.permission)) {
            continue;
        }

        const prepared = prepareItem(item, slot, context);
        if (!prepared) {
            continue;
        }

        result.splice(placementIndex(result, prepared, slot), 0, prepared);
        takenIds.add(item.id);
    }

    return result;
}

function toArray(items) {
    if (!items) {
        return [];
    }

    return typeof items.toArray === 'function' ? items.toArray() : Array.from(items);
}

function priorityOf(item) {
    const priority = Number(item?.priority);
    return Number.isFinite(priority) ? priority : 10;
}

function bindAction(action, context) {
    const bound = { ...action };

    if (typeof action.fn === 'function') {
        bound.fn = (target, ...rest) => action.fn(target, context, ...rest);
    }

    if (typeof action.isVisible === 'function') {
        bound.isVisible = (target) => action.isVisible(target, context);
    }

    return bound;
}

function prepareItem(item, slot, context) {
    if (slot === 'actions') {
        if (typeof item.isVisible === 'function' && !item.isVisible(context)) {
            return null;
        }

        const button = { ...item };
        delete button.isVisible;

        if (typeof item.onClick === 'function') {
            button.onClick = (...args) => item.onClick(context, ...args);
        }

        if (typeof item.fn === 'function') {
            button.fn = (...args) => item.fn(context, ...args);
        }

        if (Array.isArray(item.items)) {
            button.items = item.items
                .filter((child) => typeof child?.isVisible !== 'function' || child.isVisible(context.resource, context))
                .map((child) => {
                    const bound = bindAction(child, context);
                    if (typeof child.fn === 'function') {
                        bound.fn = (...args) => child.fn(context.resource, context, ...args);
                    }
                    return bound;
                });
        }

        return button;
    }

    if (slot === 'menu') {
        if (typeof item.isVisible === 'function' && !item.isVisible(context.resource, context)) {
            return null;
        }

        const bound = bindAction(item, context);
        delete bound.isVisible;
        if (typeof item.fn === 'function') {
            bound.fn = (...args) => item.fn(context.resource, context, ...args);
        }

        return bound;
    }

    if (slot === 'row-actions') {
        return bindAction(item, context);
    }

    if (slot === 'bulk-actions') {
        const bound = bindAction(item, context);
        if (typeof item.fn === 'function' && typeof context.getSelectedRows === 'function') {
            bound.fn = (...args) => item.fn(context.getSelectedRows(), context, ...args);
        }

        return bound;
    }

    return { ...item };
}

function indexOfId(items, id) {
    return items.findIndex((candidate) => candidate?.id === id);
}

function placementIndex(items, item, slot) {
    if (item.before) {
        const index = indexOfId(items, item.before);
        if (index !== -1) {
            return index;
        }
    }

    if (item.after) {
        const index = indexOfId(items, item.after);
        if (index !== -1) {
            return index + 1;
        }
    }

    if (Number.isInteger(item.index)) {
        return Math.min(Math.max(item.index, 0), items.length);
    }

    return defaultIndex(items, slot);
}

function defaultIndex(items, slot) {
    if (slot === 'columns') {
        const index = items.findIndex((column) => column?.cellComponent === 'table/cell/dropdown' || column?.sticky === 'right');
        return index === -1 ? items.length : index;
    }

    if (slot === 'row-actions' || slot === 'menu') {
        const index = indexOfId(items, 'delete');
        if (index === -1) {
            return items.length;
        }

        // Keep a separator that introduces the delete action attached to it.
        return index > 0 && items[index - 1]?.separator ? index - 1 : index;
    }

    return items.length;
}

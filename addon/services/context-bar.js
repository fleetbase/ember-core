import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { isArray } from '@ember/array';

/**
 * Tones a context-bar chip may take. Anything else falls back to `info`.
 *
 * @type {String[]}
 */
export const CHIP_TONES = ['info', 'warn', 'ok', 'menu'];

/**
 * Routes that never produce a default crumb.
 *
 * @type {String[]}
 */
export const ROOT_ROUTES = ['application', 'console'];

const SUBSTATE = /(^|[._-])(loading|error)$/;

/**
 * Turn the last segment of a route name into a label: 'order-configs' → 'Order Configs'.
 */
export function humanizeRouteSegment(routeName) {
    const segment = String(routeName).split('.').pop();
    return segment
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function normalizeCrumb(crumb) {
    if (typeof crumb === 'string') {
        return { label: crumb };
    }

    if (!crumb || typeof crumb !== 'object' || !crumb.label) {
        return null;
    }

    const normalized = { label: crumb.label };
    for (const key of ['route', 'models', 'query', 'menu', 'split']) {
        if (crumb[key] !== undefined) {
            normalized[key] = crumb[key];
        }
    }

    return normalized;
}

function normalizeChip(chip) {
    if (typeof chip === 'string') {
        return { label: chip, tone: 'info' };
    }

    if (!chip || typeof chip !== 'object' || !chip.label) {
        return null;
    }

    return { ...chip, tone: CHIP_TONES.includes(chip.tone) ? chip.tone : 'info' };
}

function normalizeList(list, normalize) {
    return (isArray(list) ? list : []).map(normalize).filter(Boolean);
}

/**
 * ContextBarService
 *
 * Holds the canvas shell's context bar: breadcrumbs and status chips. Routes and
 * controllers set them with `setCrumbs()` / `setChips()`; when a route sets no
 * crumbs, they are derived from the current route tree, labelled with the title
 * of the menu item registered for each route (or the humanised route segment).
 *
 * Crumbs and chips set during a transition belong to the route being entered.
 * Anything set before it is cleared when the transition completes, so a page's
 * context never leaks into the next one. Query-param-only transitions keep them.
 *
 * Crumb: `{ label, route?, models?, query?, menu?, split? }`
 * Chip:  `{ label, tone: 'info'|'warn'|'ok'|'menu' }`
 *
 * @class ContextBarService
 * @extends Service
 */
export default class ContextBarService extends Service {
    @service router;
    @service universe;

    @tracked _crumbs = null;
    @tracked _chips = [];

    #transitioning = false;
    #crumbsSetInTransition = false;
    #chipsSetInTransition = false;
    #listening = false;

    constructor() {
        super(...arguments);
        this.#listen();
    }

    willDestroy() {
        super.willDestroy(...arguments);

        if (this.#listening) {
            this.router.off('routeWillChange', this, this.#onRouteWillChange);
            this.router.off('routeDidChange', this, this.#onRouteDidChange);
            this.#listening = false;
        }
    }

    /**
     * Crumbs for the current page: the ones a route set, else the defaults.
     *
     * @computed crumbs
     * @returns {Array<Object>}
     */
    get crumbs() {
        return this._crumbs ?? this.defaultCrumbs;
    }

    /**
     * Chips for the current page.
     *
     * @computed chips
     * @returns {Array<Object>}
     */
    get chips() {
        return this._chips;
    }

    /**
     * Whether the current crumbs were set explicitly rather than derived.
     *
     * @computed hasCustomCrumbs
     * @returns {Boolean}
     */
    get hasCustomCrumbs() {
        return this._crumbs !== null;
    }

    /**
     * Crumbs derived from the current route tree.
     *
     * @computed defaultCrumbs
     * @returns {Array<Object>}
     */
    get defaultCrumbs() {
        const chain = [];
        for (let info = this.router.currentRoute; info; info = info.parent) {
            chain.unshift(info);
        }

        const titles = this.#menuTitlesByRoute();
        const crumbs = [];
        const models = [];

        for (const info of chain) {
            models.push(...Object.values(info.params ?? {}));

            const name = info.name;
            if (ROOT_ROUTES.includes(name) || name.endsWith('.index') || SUBSTATE.test(name)) {
                continue;
            }

            const crumb = { label: titles.get(name) ?? titles.get(`${name}.index`) ?? humanizeRouteSegment(name), route: name };
            if (models.length) {
                crumb.models = [...models];
            }

            crumbs.push(crumb);
        }

        return crumbs;
    }

    /**
     * Set the crumbs for the current page. Pass null to go back to the defaults.
     *
     * @method setCrumbs
     * @param {Array<Object|String>|null} crumbs Crumbs (strings become `{ label }`)
     */
    setCrumbs(crumbs) {
        this._crumbs = crumbs === null || crumbs === undefined ? null : normalizeList(crumbs, normalizeCrumb);
        this.#crumbsSetInTransition = this.#transitioning;
    }

    /**
     * Set the chips for the current page.
     *
     * @method setChips
     * @param {Array<Object|String>} chips Chips (strings become `{ label, tone: 'info' }`)
     */
    setChips(chips) {
        this._chips = normalizeList(chips, normalizeChip);
        this.#chipsSetInTransition = this.#transitioning;
    }

    /**
     * Clear crumbs (back to defaults) and chips.
     *
     * @method clear
     */
    clear() {
        this._crumbs = null;
        this._chips = [];
    }

    // ============================================================================
    // Internals
    // ============================================================================

    #listen() {
        if (typeof this.router?.on !== 'function') {
            return;
        }

        this.router.on('routeWillChange', this, this.#onRouteWillChange);
        this.router.on('routeDidChange', this, this.#onRouteDidChange);
        this.#listening = true;
    }

    #onRouteWillChange(transition) {
        if (transition?.queryParamsOnly) {
            return;
        }

        this.#transitioning = true;
        this.#crumbsSetInTransition = false;
        this.#chipsSetInTransition = false;
    }

    #onRouteDidChange() {
        if (!this.#transitioning) {
            return;
        }

        this.#transitioning = false;

        if (!this.#crumbsSetInTransition) {
            this._crumbs = null;
        }

        if (!this.#chipsSetInTransition) {
            this._chips = [];
        }
    }

    /**
     * Map of route name → title from every registered menu item, header items
     * winning over engine and admin items.
     */
    #menuTitlesByRoute() {
        const titles = new Map();
        const add = (item) => {
            if (item?.route && item.title && !item._isShortcut && !titles.has(item.route)) {
                titles.set(item.route, item.title);
            }
        };

        (this.universe.headerMenuItems ?? []).forEach(add);

        const registries = this.universe.registryService?.registries;
        if (registries) {
            for (const section of registries.values()) {
                (section?.['menu-item'] ?? []).forEach(add);
            }
        }

        return titles;
    }
}

import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { isArray } from '@ember/array';
import { registerDestructor } from '@ember/destroyable';

/**
 * Keys of a request that are merged into `state`, most recent request first.
 *
 * @type {String[]}
 */
export const MERGED_KEYS = ['fitBounds', 'focus', 'mode'];

/**
 * Whether a route name is `prefix` or a child of it.
 *
 * @param {String} routeName Route name, e.g. 'console.fleet-ops.operations.orders.index'
 * @param {String} prefix Route-name prefix, e.g. 'console.fleet-ops'
 * @returns {Boolean}
 */
export function routeMatches(routeName, prefix) {
    if (typeof routeName !== 'string' || typeof prefix !== 'string' || !prefix) {
        return false;
    }

    return routeName === prefix || routeName.startsWith(`${prefix}.`);
}

/**
 * The longest of `routes` that `routeName` matches, or null.
 */
function longestMatch(routeName, routes) {
    let best = null;
    for (const prefix of routes) {
        if (routeMatches(routeName, prefix) && (best === null || prefix.length > best.length)) {
            best = prefix;
        }
    }
    return best;
}

/**
 * Pick the backdrop for a route: highest priority first, then the most specific
 * matching prefix, then the earliest registration.
 *
 * @param {Array<Object>} registrations Backdrop registrations from `universe.getBackdrops()`
 * @param {String|null} routeName Current route name
 * @returns {Object|null} The registration, or null for the dot-grid canvas
 */
export function resolveBackdrop(registrations, routeName) {
    let best = null;
    let bestMatch = null;

    for (const registration of registrations) {
        const match = longestMatch(routeName, registration.routes);
        if (match === null) {
            continue;
        }

        if (best === null || registration.priority > best.priority || (registration.priority === best.priority && match.length > bestMatch.length)) {
            best = registration;
            bestMatch = match;
        }
    }

    return best;
}

/**
 * BackdropService
 *
 * Keeps one backdrop (a live map, or nothing for the dot-grid canvas) mounted
 * under the console across routes, so routes stop mounting their own map.
 *
 * - `active` is the backdrop registered (`universe.registerBackdrop`) for the
 *   current route. `mounted` lists every backdrop to render: the active one and
 *   each `keepAlive` backdrop activated this session. Hosts render all of them,
 *   hide the inactive ones and never destroy them.
 * - Routes and components call `request(owner, { layers, fitBounds, focus, mode })`
 *   to put their layers on the backdrop, and `release(owner)` to take them off.
 *   Each owner has its own entry; nothing an owner does touches another's. An
 *   owner's entry is released when the route it was requested from is exited,
 *   or when the owner (a component, say) is destroyed.
 * - The backdrop component renders `state` and registers its map with
 *   `setInstance(map)`. `onReady(cb)` callbacks queued before then run once it does.
 *
 * Layers are opaque to this service: the backdrop component decides what a
 * layer object means for the map provider in use.
 *
 * @class BackdropService
 * @extends Service
 */
export default class BackdropService extends Service {
    @service router;
    @service universe;

    /**
     * Bumped on every change so getters recompute. Bookkeeping is kept untracked
     * and only written outside render (router events, explicit calls).
     */
    @tracked _version = 0;

    #requests = new Map();
    #activated = new Set();
    #instances = new Map();
    #readyCallbacks = [];
    #destructorOwners = new WeakSet();
    #sequence = 0;
    #pendingRoute = null;
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
            this.universe.off?.('backdrop.registered', this, this.#onRegistered);
            this.#listening = false;
        }
    }

    // ============================================================================
    // Which backdrop
    // ============================================================================

    /**
     * The backdrop registration for the current route, or null for the dot-grid canvas.
     *
     * @computed active
     * @returns {Object|null} `{ name, component, routes, priority, keepAlive }`
     */
    get active() {
        this._version;
        return resolveBackdrop(this.#registrations(), this.router.currentRouteName ?? null);
    }

    /**
     * Backdrops to render, in registration order: the active one and every
     * `keepAlive` backdrop activated this session.
     *
     * @computed mounted
     * @returns {Array<Object>} Backdrop registrations
     */
    get mounted() {
        const active = this.active;
        return this.#registrations().filter((registration) => registration === active || (registration.keepAlive && this.#activated.has(registration.name)));
    }

    /**
     * Whether a backdrop is the active one.
     *
     * @method isActive
     * @param {String} name Backdrop name
     * @returns {Boolean}
     */
    isActive(name) {
        return this.active?.name === name;
    }

    // ============================================================================
    // Requests
    // ============================================================================

    /**
     * Put an owner's layers on the backdrop. Requesting again for the same owner
     * replaces its entry. The entry is released when the route it was requested
     * from (`options.route`, the owner's own route, or the route being entered)
     * is exited, or when the owner is destroyed.
     *
     * @method request
     * @param {Object|String} owner The route, component or key the layers belong to
     * @param {Object} [options]
     * @param {Array} [options.layers] Layer objects for the backdrop component
     * @param {*} [options.fitBounds] Bounds to fit the view to
     * @param {*} [options.focus] What to focus (a record, a point, …)
     * @param {String} [options.mode] Backdrop mode, e.g. 'live' or 'edit'
     * @param {String} [options.route] Route name that scopes the entry; defaults as above
     * @returns {Object} Handle `{ owner, layers, isReleased, update(options), release() }`
     * @throws {Error} When no owner is given
     */
    request(owner, options = {}) {
        if (owner === null || owner === undefined) {
            throw new Error('backdrop.request requires an owner.');
        }

        const { layers, route, ...rest } = options ?? {};
        const entry = {
            owner,
            layers: isArray(layers) ? layers.filter(Boolean) : [],
            route: route ?? this.#routeOf(owner),
            seq: ++this.#sequence,
        };
        for (const key of MERGED_KEYS) {
            entry[key] = rest[key];
        }

        this.#requests.set(owner, entry);
        this.#releaseOnDestroy(owner);
        this._version++;

        return this.#handle(owner);
    }

    /**
     * Take an owner's layers off the backdrop. Other owners are untouched.
     *
     * @method release
     * @param {Object|String} owner The owner passed to `request`
     * @returns {Boolean} Whether the owner had an entry
     */
    release(owner) {
        const released = this.#requests.delete(owner);
        if (released) {
            this._version++;
        }
        return released;
    }

    /**
     * Whether an owner has layers on the backdrop.
     *
     * @method hasRequest
     * @param {Object|String} owner Owner
     * @returns {Boolean}
     */
    hasRequest(owner) {
        this._version;
        return this.#requests.has(owner);
    }

    /**
     * Merged state for the backdrop component to render.
     *
     * - `layers`: `[{ owner, layers }]`, one group per owner, in request order.
     * - `fitBounds`, `focus`, `mode`: from the most recent request that set each.
     *
     * @computed state
     * @returns {Object} `{ layers, fitBounds, focus, mode }`
     */
    get state() {
        this._version;

        const entries = [...this.#requests.values()];
        const state = { layers: entries.map(({ owner, layers }) => ({ owner, layers })) };

        for (const key of MERGED_KEYS) {
            let latest = null;
            for (const entry of entries) {
                if (entry[key] !== undefined && (latest === null || entry.seq > latest.seq)) {
                    latest = entry;
                }
            }
            state[key] = latest ? latest[key] : null;
        }

        return state;
    }

    // ============================================================================
    // Map instance
    // ============================================================================

    /**
     * The map instance of the active backdrop, or null until it registers one.
     *
     * @computed instance
     * @returns {*}
     */
    get instance() {
        const active = this.active;
        return active ? (this.#instances.get(active.name) ?? null) : null;
    }

    /**
     * Whether the active backdrop has registered its map instance.
     *
     * @computed isReady
     * @returns {Boolean}
     */
    get isReady() {
        return this.instance !== null;
    }

    /**
     * Called by a backdrop component once its map has loaded; pass null when it
     * is torn down. Queued `onReady` callbacks run when the active backdrop
     * becomes ready.
     *
     * @method setInstance
     * @param {*} instance The map instance (Leaflet map, Google map, …), or null
     * @param {String} [name] Backdrop name; defaults to the active backdrop
     */
    setInstance(instance, name = this.active?.name) {
        if (!name) {
            return;
        }

        if (instance === null || instance === undefined) {
            this.#instances.delete(name);
        } else {
            this.#instances.set(name, instance);
        }

        this._version++;
        this.#flushReady();
    }

    /**
     * Run `callback(instance, state)` once the active backdrop's map is ready:
     * now if it is, else when it registers. Requests made before then are
     * already in `state`.
     *
     * @method onReady
     * @param {Function} callback `(instance, state) => void`
     * @returns {Function} Cancels the callback if it has not run yet
     */
    onReady(callback) {
        if (this.isReady) {
            callback(this.instance, this.state);
            return () => {};
        }

        this.#readyCallbacks.push(callback);
        return () => {
            this.#readyCallbacks = this.#readyCallbacks.filter((queued) => queued !== callback);
        };
    }

    // ============================================================================
    // Internals
    // ============================================================================

    #registrations() {
        return this.universe.getBackdrops?.() ?? [];
    }

    #handle(owner) {
        const service = this;
        return {
            owner,
            get layers() {
                return service.#requests.get(owner)?.layers ?? [];
            },
            get isReleased() {
                return !service.hasRequest(owner);
            },
            update(options = {}) {
                const current = service.#requests.get(owner) ?? {};
                const merged = { layers: current.layers, route: current.route };
                for (const key of MERGED_KEYS) {
                    merged[key] = current[key];
                }
                return service.request(owner, { ...merged, ...options });
            },
            release() {
                return service.release(owner);
            },
        };
    }

    /**
     * The route an owner's entry belongs to: a route's own full name, the route
     * being entered during a transition, else the current route.
     */
    #routeOf(owner) {
        if (typeof owner === 'object') {
            const routeName = owner.fullRouteName ?? owner.routeName;
            if (typeof routeName === 'string') {
                return routeName;
            }
        }

        return this.#pendingRoute ?? this.router.currentRouteName ?? null;
    }

    #releaseOnDestroy(owner) {
        if (typeof owner !== 'object' || this.#destructorOwners.has(owner)) {
            return;
        }

        this.#destructorOwners.add(owner);
        try {
            registerDestructor(owner, () => this.release(owner));
        } catch (_) {
            // Already destroying: nothing to wait for. Route exit or release() still apply.
        }
    }

    #flushReady() {
        if (!this.isReady || this.#readyCallbacks.length === 0) {
            return;
        }

        const callbacks = this.#readyCallbacks;
        this.#readyCallbacks = [];
        const { instance, state } = this;
        callbacks.forEach((callback) => callback(instance, state));
    }

    #recordActive() {
        const active = this.active;
        if (active && !this.#activated.has(active.name)) {
            this.#activated.add(active.name);
            this._version++;
        }
    }

    #listen() {
        if (typeof this.router?.on !== 'function') {
            return;
        }

        this.router.on('routeWillChange', this, this.#onRouteWillChange);
        this.router.on('routeDidChange', this, this.#onRouteDidChange);
        this.universe.on?.('backdrop.registered', this, this.#onRegistered);
        this.#listening = true;
    }

    #onRegistered() {
        this._version++;
    }

    #onRouteWillChange(transition) {
        if (transition?.queryParamsOnly) {
            return;
        }

        // The backdrop being left was active; keep it mounted if it is keep-alive.
        this.#recordActive();
        this.#pendingRoute = transition?.to?.name ?? null;
    }

    #onRouteDidChange(transition) {
        if (transition?.queryParamsOnly) {
            return;
        }

        this.#pendingRoute = null;
        const current = this.router.currentRouteName;

        let released = false;
        for (const [owner, entry] of this.#requests) {
            if (entry.route && !routeMatches(current, entry.route)) {
                this.#requests.delete(owner);
                released = true;
            }
        }

        if (released) {
            this._version++;
        }

        this.#recordActive();
        this.#flushReady();
    }
}

import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { isArray } from '@ember/array';
import { next } from '@ember/runloop';

/**
 * User option holding the dock order and hidden items: `{ order: [id], hidden: [id] }`.
 *
 * @type {String}
 */
export const DOCK_OPTION_KEY = 'dock';

/**
 * User option the classic SmartNavMenu saves its pinned ids under: `{ pinnedIds: [id] }`.
 * Read once and copied into the dock option as the starting order.
 *
 * @type {String}
 */
export const LEGACY_NAV_OPTION_KEY = 'smart-nav-menu-prefs';

/**
 * Company option holding role defaults: `{ [roleId]: { order: [id], locked: [id] } }`.
 *
 * @type {String}
 */
export const ROLE_DEFAULTS_OPTION_KEY = 'dock_role_defaults';

/**
 * Permission that lets a non-admin user edit role defaults.
 *
 * @type {String}
 */
export const MANAGE_ROLES_PERMISSION = 'iam update role';

function idList(value) {
    return isArray(value) ? value.filter((id) => typeof id === 'string' && id.length > 0) : [];
}

function unique(ids) {
    return [...new Set(ids)];
}

function itemId(item) {
    return item.id ?? item.slug;
}

/**
 * DockService
 *
 * The canvas shell's dock: the ordered list of header menu items (modules) a
 * user sees, with their own order and hidden items on top of the defaults an
 * admin sets for their role.
 *
 * - Items come from `universe.headerMenuItems`. Shortcut items appear only when
 *   the user's or role's order names them; items whose `permission` the user
 *   lacks are left out.
 * - Role defaults give the starting order and a set of locked items. Locked
 *   items cannot be hidden and keep their role-default position; users reorder
 *   the other items around them.
 * - The user's order and hidden ids are saved as the `dock` user option. On
 *   first read, the classic SmartNavMenu's pinned ids become the starting order.
 *
 * @class DockService
 * @extends Service
 */
export default class DockService extends Service {
    @service universe;
    @service currentUser;
    @service abilities;

    /**
     * Bumped on every write so getters recompute. Preferences themselves are
     * cached untracked so a lazy first read inside a getter never writes
     * tracked state that was already consumed.
     */
    @tracked _version = 0;

    #prefs = null;
    #prefsOwner = null;

    // ============================================================================
    // Reading
    // ============================================================================

    /**
     * Visible dock items, in dock order.
     *
     * @computed items
     * @returns {Array<Object>} Header menu items
     */
    get items() {
        const hidden = new Set(this.#effectiveHiddenIds());
        return this.#orderedItems().filter((item) => !hidden.has(itemId(item)));
    }

    /**
     * Items the user has hidden, in dock order.
     *
     * @computed hiddenItems
     * @returns {Array<Object>} Header menu items
     */
    get hiddenItems() {
        const hidden = new Set(this.#effectiveHiddenIds());
        return this.#orderedItems().filter((item) => hidden.has(itemId(item)));
    }

    /**
     * Ids the current user's role locks into the dock.
     *
     * @computed lockedIds
     * @returns {Array<String>} Locked item ids
     */
    get lockedIds() {
        return this.#currentRoleDefaults().locked;
    }

    /**
     * Whether the current user can edit role defaults: admins, or anyone with
     * the `iam update role` permission.
     *
     * @computed canManageRoles
     * @returns {Boolean}
     */
    get canManageRoles() {
        if (this.currentUser.isAdmin === true) {
            return true;
        }

        try {
            return this.abilities.can(MANAGE_ROLES_PERMISSION) === true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Whether an item is locked for the current user.
     *
     * @method isLocked
     * @param {String} id Item id
     * @returns {Boolean}
     */
    isLocked(id) {
        return this.lockedIds.includes(id);
    }

    /**
     * The dock defaults for a role.
     *
     * @method roleDefaults
     * @param {String} roleId Role id
     * @returns {Object} `{ order: [id], locked: [id] }`
     */
    roleDefaults(roleId) {
        // Consume the version so callers recompute after setRoleDefaults.
        this._version;

        const entry = roleId ? this.readRoleDefaultsStore()[roleId] : null;
        return { order: idList(entry?.order), locked: idList(entry?.locked) };
    }

    // ============================================================================
    // User changes
    // ============================================================================

    /**
     * Save the user's dock order. Ids may include hidden or locked items; locked
     * items keep their role-default position regardless.
     *
     * @method reorder
     * @param {Array<String>} ids Item ids in the new order
     */
    reorder(ids) {
        const prefs = this.#loadPrefs();
        this.#savePrefs({ ...prefs, order: unique(idList(ids)) });
    }

    /**
     * Hide an item from the dock. Locked items cannot be hidden.
     *
     * @method hide
     * @param {String} id Item id
     * @returns {Boolean} Whether the item is now hidden
     */
    hide(id) {
        if (!id || this.isLocked(id)) {
            return false;
        }

        const prefs = this.#loadPrefs();
        if (!prefs.hidden.includes(id)) {
            this.#savePrefs({ ...prefs, hidden: [...prefs.hidden, id] });
        }

        return true;
    }

    /**
     * Show a hidden item again.
     *
     * @method show
     * @param {String} id Item id
     */
    show(id) {
        const prefs = this.#loadPrefs();
        if (prefs.hidden.includes(id)) {
            this.#savePrefs({ ...prefs, hidden: prefs.hidden.filter((hiddenId) => hiddenId !== id) });
        }
    }

    /**
     * Drop the user's order and hidden items, back to the role defaults.
     *
     * @method reset
     */
    reset() {
        this.#savePrefs({ order: [], hidden: [] });
    }

    // ============================================================================
    // Role defaults (admins)
    // ============================================================================

    /**
     * Save the dock defaults for a role.
     *
     * @method setRoleDefaults
     * @param {String} roleId Role id
     * @param {Object} defaults `{ order: [id], locked: [id] }`
     * @returns {Promise<Object>} The saved defaults
     * @throws {Error} When the user cannot manage roles or no role is given
     */
    async setRoleDefaults(roleId, { order = [], locked = [] } = {}) {
        if (!this.canManageRoles) {
            throw new Error('You do not have permission to change role dock defaults.');
        }

        if (!roleId) {
            throw new Error('setRoleDefaults requires a role id.');
        }

        const defaults = { order: unique(idList(order)), locked: unique(idList(locked)) };
        const store = { ...this.readRoleDefaultsStore(), [roleId]: defaults };

        await this.writeRoleDefaultsStore(store);
        this._version++;

        return defaults;
    }

    /**
     * Role-defaults storage adapter: read.
     *
     * Role defaults live in the company's `options` JSON under
     * `dock_role_defaults`, the same place other org-level console settings live.
     *
     * TODO(shell-phase-2): move to a dedicated endpoint (e.g. GET/PUT
     * `int/v1/roles/{id}/dock` or `int/v1/companies/{id}/dock-defaults`) that
     * checks `iam update role` server side and merges one role at a time. Today
     * any user who can update the company can write this key, and a save
     * replaces the whole `options` object. Only these two methods need to change.
     *
     * @method readRoleDefaultsStore
     * @returns {Object} `{ [roleId]: { order, locked } }`
     */
    readRoleDefaultsStore() {
        const value = this.currentUser.getCompanyOption(ROLE_DEFAULTS_OPTION_KEY, null);
        return value && typeof value === 'object' && !isArray(value) ? value : {};
    }

    /**
     * Role-defaults storage adapter: write. See readRoleDefaultsStore.
     *
     * @method writeRoleDefaultsStore
     * @param {Object} store `{ [roleId]: { order, locked } }`
     * @returns {Promise}
     */
    async writeRoleDefaultsStore(store) {
        const company = await this.currentUser.loadCompany();
        const options = company.options ?? {};

        company.set('options', { ...options, [ROLE_DEFAULTS_OPTION_KEY]: store });
        return company.save();
    }

    // ============================================================================
    // Internals
    // ============================================================================

    #currentRoleId() {
        return this.currentUser.role?.id ?? this.currentUser.user?.role_uuid ?? null;
    }

    #currentRoleDefaults() {
        return this.roleDefaults(this.#currentRoleId());
    }

    #canSee(item) {
        if (!item.permission) {
            return true;
        }

        try {
            return this.abilities.can(item.permission) !== false;
        } catch (_) {
            return true;
        }
    }

    #effectiveHiddenIds() {
        const locked = new Set(this.lockedIds);
        return this.#loadPrefs().hidden.filter((id) => !locked.has(id));
    }

    /**
     * Every available item in dock order, hidden ones included.
     */
    #orderedItems() {
        const prefs = this.#loadPrefs();
        const role = this.#currentRoleDefaults();
        const named = new Set([...prefs.order, ...role.order]);

        const available = (this.universe.headerMenuItems ?? []).filter((item) => itemId(item) && (!item._isShortcut || named.has(itemId(item))) && this.#canSee(item));
        const byId = new Map(available.map((item) => [itemId(item), item]));

        // The role sequence: role order first, then everything else by priority.
        const roleSequence = unique([...role.order.filter((id) => byId.has(id)), ...byId.keys()]);
        const locked = new Set(role.locked.filter((id) => byId.has(id)));

        // Unlocked items follow the user's order, then the role sequence.
        const unlockedSequence = unique([...prefs.order, ...roleSequence].filter((id) => byId.has(id) && !locked.has(id)));

        // Locked items keep their slot in the role sequence; the rest fill around them.
        let next = 0;
        return roleSequence.map((id) => byId.get(locked.has(id) ? id : unlockedSequence[next++]));
    }

    #loadPrefs() {
        // Consume the version so getters recompute after a write.
        this._version;

        // Options are per user; drop the cache when someone else signs in.
        const owner = this.currentUser.id ?? null;
        if (this.#prefs && this.#prefsOwner === owner) {
            return this.#prefs;
        }

        this.#prefsOwner = owner;

        const stored = this.currentUser.getOption(DOCK_OPTION_KEY);
        if (stored && typeof stored === 'object') {
            this.#prefs = { order: idList(stored.order), hidden: idList(stored.hidden) };
            return this.#prefs;
        }

        // First read: start from the classic SmartNavMenu's pinned ids, if any.
        // Unpinned items are not hidden: the classic bar kept them in its
        // overflow menu, and items registered later could not be judged yet.
        const legacy = this.currentUser.getOption(LEGACY_NAV_OPTION_KEY);
        this.#prefs = { order: unique(idList(legacy?.pinnedIds)), hidden: [] };

        // Written on the next run loop: this read can happen during render.
        if (this.#prefs.order.length) {
            const migrated = this.#prefs;
            next(this, () => this.#persist(migrated));
        }

        return this.#prefs;
    }

    #savePrefs(prefs) {
        this.#prefs = prefs;
        this.#prefsOwner = this.currentUser.id ?? null;
        this.#persist(prefs);
        this._version++;
    }

    #persist(prefs) {
        try {
            this.currentUser.setOption(DOCK_OPTION_KEY, { order: prefs.order, hidden: prefs.hidden });
        } catch (_) {
            // Storage unavailable: keep the in-memory preferences for this session.
        }
    }
}

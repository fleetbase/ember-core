import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { DOCK_OPTION_KEY, LEGACY_NAV_OPTION_KEY, ROLE_DEFAULTS_OPTION_KEY, MANAGE_ROLES_PERMISSION } from '@fleetbase/ember-core/services/dock';

/**
 * The dock merges three layers: header menu items (by priority), the admin's
 * role defaults (order + locked) and the user's own order and hidden ids. The
 * collaborators are stubbed so each layer can be set directly.
 */
const ids = (items) => items.map((item) => item.id);

class UniverseStub extends Service {
    headerMenuItems = [
        { id: 'fleet-ops', title: 'Fleet-Ops', priority: 0 },
        { id: 'storefront', title: 'Storefront', priority: 1 },
        { id: 'ledger', title: 'Ledger', priority: 2 },
        { id: 'iam', title: 'IAM', priority: 3, permission: 'iam see extension' },
        { slug: 'pallet', title: 'Pallet', priority: 4 },
        { id: 'fleet-ops-sc-scheduler', title: 'Scheduler', _isShortcut: true },
    ];
}

class CurrentUserStub extends Service {
    id = 'user-1';
    isAdmin = false;
    role = { id: 'role-ops' };
    user = {};
    stored = new Map();
    companyOptions = {};
    saves = 0;
    company = null;

    getOption(key, defaultValue = null) {
        return this.stored.has(key) ? this.stored.get(key) : defaultValue;
    }

    setOption(key, value) {
        this.stored.set(key, value);
        return this;
    }

    getCompanyOption(key, defaultValue = null) {
        return this.companyOptions[key] ?? defaultValue;
    }

    async loadCompany() {
        const owner = this;
        this.company = this.company ?? {
            options: undefined,
            set(key, value) {
                this[key] = value;
                owner.companyOptions = value;
            },
            async save() {
                owner.saves++;
                return this;
            },
        };
        return this.company;
    }
}

class AbilitiesStub extends Service {
    granted = new Set(['iam see extension']);
    can(permission) {
        return this.granted.has(permission);
    }
}

module('Unit | Service | dock', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:universe', UniverseStub);
        this.owner.register('service:current-user', CurrentUserStub);
        this.owner.register('service:abilities', AbilitiesStub);

        this.universe = this.owner.lookup('service:universe');
        this.currentUser = this.owner.lookup('service:current-user');
        this.abilities = this.owner.lookup('service:abilities');
        this.dock = () => this.owner.lookup('service:dock');
    });

    module('items', function () {
        test('with no preferences, modules come in priority order without shortcuts', function (assert) {
            assert.deepEqual(ids(this.dock().items), ['fleet-ops', 'storefront', 'ledger', 'iam', undefined]);
            assert.strictEqual(this.dock().items[4].slug, 'pallet', 'an item without an id is keyed by slug');
            assert.deepEqual(this.dock().hiddenItems, []);
        });

        test('items the user lacks permission for are left out', function (assert) {
            this.abilities.granted.clear();
            assert.notOk(ids(this.dock().items).includes('iam'));
        });

        test('an abilities error does not hide the item', function (assert) {
            this.abilities.can = () => {
                throw new Error('unknown ability');
            };
            assert.ok(ids(this.dock().items).includes('iam'));
        });

        test('items without id or slug are skipped and a missing registry is empty', function (assert) {
            this.universe.headerMenuItems = [{ title: 'Nameless' }];
            assert.deepEqual(this.dock().items, []);

            this.universe.headerMenuItems = null;
            assert.deepEqual(this.dock().items, []);
        });

        test('a shortcut appears when the user order names it', function (assert) {
            this.dock().reorder(['fleet-ops-sc-scheduler', 'ledger']);
            assert.deepEqual(ids(this.dock().items).slice(0, 3), ['fleet-ops-sc-scheduler', 'ledger', 'fleet-ops']);
        });

        test('the role order sets the starting sequence', function (assert) {
            this.currentUser.companyOptions[ROLE_DEFAULTS_OPTION_KEY] = { 'role-ops': { order: ['ledger', 'missing', 'storefront'], locked: [] } };
            assert.deepEqual(ids(this.dock().items).slice(0, 3), ['ledger', 'storefront', 'fleet-ops']);
        });

        test('the user order wins over the role order for unlocked items', function (assert) {
            this.currentUser.companyOptions[ROLE_DEFAULTS_OPTION_KEY] = { 'role-ops': { order: ['ledger', 'storefront'] } };
            this.dock().reorder(['storefront']);
            assert.deepEqual(ids(this.dock().items).slice(0, 3), ['storefront', 'ledger', 'fleet-ops']);
        });

        test('locked items keep their role position while the rest reorder around them', function (assert) {
            this.currentUser.companyOptions[ROLE_DEFAULTS_OPTION_KEY] = { 'role-ops': { order: ['fleet-ops', 'storefront', 'ledger'], locked: ['storefront', 'gone'] } };
            this.dock().reorder(['ledger', 'storefront', 'fleet-ops']);

            assert.deepEqual(ids(this.dock().items).slice(0, 3), ['ledger', 'storefront', 'fleet-ops']);

            this.dock().reorder(['iam', 'ledger']);
            assert.deepEqual(ids(this.dock().items).slice(0, 4), ['iam', 'storefront', 'ledger', 'fleet-ops']);
        });

        test('the role is read from the user record when the snapshot has none', function (assert) {
            this.currentUser.role = null;
            this.currentUser.user = { role_uuid: 'role-x' };
            this.currentUser.companyOptions[ROLE_DEFAULTS_OPTION_KEY] = { 'role-x': { order: ['ledger'], locked: ['ledger'] } };

            assert.deepEqual(this.dock().lockedIds, ['ledger']);
            assert.strictEqual(this.dock().items[0].id, 'ledger');
        });

        test('with no role at all there are no role defaults', function (assert) {
            this.currentUser.role = undefined;
            this.currentUser.user = undefined;
            assert.deepEqual(this.dock().lockedIds, []);
        });
    });

    module('hide and show', function () {
        test('hiding moves an item to hiddenItems and saves it', function (assert) {
            assert.true(this.dock().hide('ledger'));
            assert.notOk(ids(this.dock().items).includes('ledger'));
            assert.deepEqual(ids(this.dock().hiddenItems), ['ledger']);
            assert.deepEqual(this.currentUser.stored.get(DOCK_OPTION_KEY), { order: [], hidden: ['ledger'] });

            assert.true(this.dock().hide('ledger'), 'hiding twice is a no-op');
            assert.deepEqual(this.currentUser.stored.get(DOCK_OPTION_KEY).hidden, ['ledger']);
        });

        test('showing brings it back; showing a visible item does nothing', function (assert) {
            this.dock().hide('ledger');
            this.dock().show('ledger');
            assert.ok(ids(this.dock().items).includes('ledger'));
            assert.deepEqual(this.currentUser.stored.get(DOCK_OPTION_KEY).hidden, []);

            this.currentUser.stored.clear();
            this.dock().show('storefront');
            assert.notOk(this.currentUser.stored.has(DOCK_OPTION_KEY), 'nothing was written');
        });

        test('locked items cannot be hidden, and stale hidden ids for them are ignored', function (assert) {
            this.currentUser.stored.set(DOCK_OPTION_KEY, { order: [], hidden: ['storefront'] });
            this.currentUser.companyOptions[ROLE_DEFAULTS_OPTION_KEY] = { 'role-ops': { locked: ['storefront'] } };

            assert.true(this.dock().isLocked('storefront'));
            assert.false(this.dock().hide('storefront'));
            assert.ok(ids(this.dock().items).includes('storefront'));
            assert.deepEqual(this.dock().hiddenItems, []);
        });

        test('hiding nothing returns false', function (assert) {
            assert.false(this.dock().hide(null));
        });

        test('reset drops the user order and hidden ids', function (assert) {
            this.dock().reorder(['ledger']);
            this.dock().hide('iam');
            this.dock().reset();
            assert.deepEqual(this.currentUser.stored.get(DOCK_OPTION_KEY), { order: [], hidden: [] });
            assert.strictEqual(this.dock().items[0].id, 'fleet-ops');
        });
    });

    module('preferences', function () {
        test('reorder drops bad and duplicate ids', function (assert) {
            this.dock().reorder(['ledger', 'ledger', '', 7, null, 'iam']);
            assert.deepEqual(this.currentUser.stored.get(DOCK_OPTION_KEY).order, ['ledger', 'iam']);

            this.dock().reorder('nope');
            assert.deepEqual(this.currentUser.stored.get(DOCK_OPTION_KEY).order, []);
        });

        test('a saved dock option is read back', function (assert) {
            this.currentUser.stored.set(DOCK_OPTION_KEY, { order: ['iam'], hidden: 'bad' });
            assert.strictEqual(this.dock().items[0].id, 'iam');
            assert.deepEqual(this.dock().hiddenItems, []);
        });

        test('the SmartNavMenu pinned ids become the starting order once', async function (assert) {
            this.currentUser.stored.set(LEGACY_NAV_OPTION_KEY, { pinnedIds: ['ledger', 'storefront', 'ledger'] });

            assert.deepEqual(ids(this.dock().items).slice(0, 2), ['ledger', 'storefront']);
            assert.deepEqual(this.dock().hiddenItems, [], 'unpinned items are not hidden');

            await settled();
            assert.deepEqual(this.currentUser.stored.get(DOCK_OPTION_KEY), { order: ['ledger', 'storefront'], hidden: [] }, 'migrated into the dock option');

            this.currentUser.stored.set(LEGACY_NAV_OPTION_KEY, { pinnedIds: ['iam'] });
            this.currentUser.id = 'user-1b';
            assert.strictEqual(this.dock().items[0].id, 'ledger', 'the dock option wins over the legacy one');
        });

        test('no legacy option means nothing is written', async function (assert) {
            this.currentUser.stored.set(LEGACY_NAV_OPTION_KEY, { pinnedIds: 'nope' });
            assert.ok(this.dock().items);
            await settled();
            assert.notOk(this.currentUser.stored.has(DOCK_OPTION_KEY));
        });

        test('preferences are reloaded when the user changes', function (assert) {
            this.dock().reorder(['iam']);
            assert.strictEqual(this.dock().items[0].id, 'iam');

            this.currentUser.id = undefined;
            this.currentUser.stored.set(DOCK_OPTION_KEY, { order: ['ledger'], hidden: [] });
            assert.strictEqual(this.dock().items[0].id, 'ledger');

            this.dock().reorder(['storefront']);
            assert.strictEqual(this.dock().items[0].id, 'storefront', 'a signed-out user still gets in-memory changes');
        });

        test('a storage error keeps the change in memory', function (assert) {
            this.currentUser.setOption = () => {
                throw new Error('quota');
            };
            this.dock().hide('ledger');
            assert.notOk(ids(this.dock().items).includes('ledger'));
        });
    });

    module('role defaults', function () {
        test('roleDefaults returns empty lists for unknown, missing or malformed roles', function (assert) {
            assert.deepEqual(this.dock().roleDefaults('nobody'), { order: [], locked: [] });
            assert.deepEqual(this.dock().roleDefaults(null), { order: [], locked: [] });

            this.currentUser.companyOptions[ROLE_DEFAULTS_OPTION_KEY] = ['not', 'a', 'map'];
            assert.deepEqual(this.dock().readRoleDefaultsStore(), {});
        });

        test('canManageRoles: admins and holders of the role permission', function (assert) {
            assert.false(this.dock().canManageRoles);

            this.abilities.granted.add(MANAGE_ROLES_PERMISSION);
            assert.true(this.dock().canManageRoles);

            this.abilities.granted.clear();
            this.currentUser.isAdmin = true;
            assert.true(this.dock().canManageRoles);
        });

        test('canManageRoles is false when abilities throw', function (assert) {
            this.abilities.can = () => {
                throw new Error('boom');
            };
            assert.false(this.dock().canManageRoles);
        });

        test('setRoleDefaults is refused without permission', async function (assert) {
            await assert.rejects(this.dock().setRoleDefaults('role-ops', { order: ['ledger'] }), /permission/);
            assert.strictEqual(this.currentUser.saves, 0);
        });

        test('setRoleDefaults requires a role id', async function (assert) {
            this.currentUser.isAdmin = true;
            await assert.rejects(this.dock().setRoleDefaults('', {}), /role id/);
        });

        test('setRoleDefaults saves into the company options and updates the dock', async function (assert) {
            this.currentUser.isAdmin = true;
            this.currentUser.companyOptions = { other_setting: true };
            const company = await this.currentUser.loadCompany();
            company.options = { other_setting: true };

            assert.strictEqual(this.dock().items[0].id, 'fleet-ops');

            const saved = await this.dock().setRoleDefaults('role-ops', { order: ['ledger', 'ledger'], locked: ['ledger'] });
            assert.deepEqual(saved, { order: ['ledger'], locked: ['ledger'] });
            assert.strictEqual(this.currentUser.saves, 1);
            assert.true(company.options.other_setting, 'other company options are kept');
            assert.deepEqual(company.options[ROLE_DEFAULTS_OPTION_KEY], { 'role-ops': { order: ['ledger'], locked: ['ledger'] } });

            assert.strictEqual(this.dock().items[0].id, 'ledger');
            assert.deepEqual(this.dock().lockedIds, ['ledger']);
            assert.deepEqual(this.dock().roleDefaults('role-ops'), saved);
        });

        test('setRoleDefaults defaults to empty lists and handles a company with no options', async function (assert) {
            this.currentUser.isAdmin = true;
            assert.deepEqual(await this.dock().setRoleDefaults('role-ops'), { order: [], locked: [] });
            assert.deepEqual(this.currentUser.company.options, { [ROLE_DEFAULTS_OPTION_KEY]: { 'role-ops': { order: [], locked: [] } } });
        });
    });
});

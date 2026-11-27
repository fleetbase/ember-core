import { module, test } from 'qunit';
import MenuItem, { MENU_ITEM_STATUS_TONES, MENU_ITEM_DOCK_FIELDS } from '@fleetbase/ember-core/contracts/menu-item';

module('Unit | Contract | MenuItem (dock fields)', function () {
    test('the dock fields and status tones are exported', function (assert) {
        assert.deepEqual(MENU_ITEM_DOCK_FIELDS, ['color', 'status', 'badge', 'shortcut', 'group']);
        assert.deepEqual(MENU_ITEM_STATUS_TONES, ['warn', 'error', 'info']);
    });

    test('a string-title item defaults every dock field to null', function (assert) {
        const item = new MenuItem('Fleet-Ops', 'console.fleet-ops').toObject();
        for (const field of MENU_ITEM_DOCK_FIELDS) {
            assert.strictEqual(item[field], null, `${field} is null`);
        }
    });

    test('a definition object carries the dock fields', function (assert) {
        const item = new MenuItem({
            title: 'Fleet-Ops',
            route: 'console.fleet-ops',
            color: '#2563eb',
            status: { tone: 'warn', text: '3 late' },
            badge: 4,
            shortcut: 'g f',
            group: 'operations',
        }).toObject();

        assert.strictEqual(item.color, '#2563eb');
        assert.deepEqual(item.status, { tone: 'warn', text: '3 late' });
        assert.strictEqual(item.badge, 4);
        assert.strictEqual(item.shortcut, 'g f');
        assert.strictEqual(item.group, 'operations');
    });

    test('a definition object without dock fields leaves them null', function (assert) {
        const item = new MenuItem({ title: 'Ledger' }).toObject();
        assert.strictEqual(item.color, null);
        assert.strictEqual(item.status, null);
        assert.strictEqual(item.badge, null);
    });

    test('a badge of 0 is kept', function (assert) {
        assert.strictEqual(new MenuItem({ title: 'Ledger', badge: 0 }).toObject().badge, 0);
    });

    test('a raw string status in the definition is normalised in toObject', function (assert) {
        const item = new MenuItem({ title: 'Ledger', status: 'Syncing' }).toObject();
        assert.deepEqual(item.status, { tone: 'info', text: 'Syncing' });
    });

    test('normalizeStatus handles every input shape', function (assert) {
        assert.strictEqual(MenuItem.normalizeStatus(null), null);
        assert.strictEqual(MenuItem.normalizeStatus(''), null);
        assert.strictEqual(MenuItem.normalizeStatus(42), null);
        assert.deepEqual(MenuItem.normalizeStatus('Live'), { tone: 'info', text: 'Live' });
        assert.deepEqual(MenuItem.normalizeStatus({ tone: 'error', text: 'Down' }), { tone: 'error', text: 'Down' });
        assert.deepEqual(MenuItem.normalizeStatus({ tone: 'loud', text: 'Hmm' }), { tone: 'info', text: 'Hmm' });
        assert.deepEqual(MenuItem.normalizeStatus({ tone: 'warn' }), { tone: 'warn', text: null });
    });

    test('builder methods set and clear the dock fields', function (assert) {
        const item = new MenuItem('Fleet-Ops', 'console.fleet-ops')
            .withColor('teal')
            .withStatus({ tone: 'error', text: 'Offline' })
            .withBadge('new')
            .withShortcut('g f')
            .inGroup('operations');

        let obj = item.toObject();
        assert.strictEqual(obj.color, 'teal');
        assert.deepEqual(obj.status, { tone: 'error', text: 'Offline' });
        assert.strictEqual(obj.badge, 'new');
        assert.strictEqual(obj.shortcut, 'g f');
        assert.strictEqual(obj.group, 'operations');

        item.withColor('').withStatus(null).withBadge(undefined).withShortcut(null).inGroup('');
        obj = item.toObject();
        for (const field of MENU_ITEM_DOCK_FIELDS) {
            assert.strictEqual(obj[field], null, `${field} cleared`);
        }
    });

    test('withShortcut does not touch the shortcuts sub-links', function (assert) {
        const item = new MenuItem('Fleet-Ops', 'console.fleet-ops').withShortcuts([{ title: 'Scheduler' }]).withShortcut('g s');
        assert.strictEqual(item.shortcut, 'g s');
        assert.strictEqual(item.shortcuts.length, 1);
    });
});

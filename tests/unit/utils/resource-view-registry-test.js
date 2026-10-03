import { module, test } from 'qunit';
import { parseRegistryName, parseRegistryPrefix, buildRegistryName, resourceRegistryNames, detailsTabsRegistryName } from '@fleetbase/ember-core/utils/resource-view-registry';

module('Unit | Utility | resource-view-registry', function () {
    test('it parses a valid registry name into its segments', function (assert) {
        assert.deepEqual(parseRegistryName('fleet-ops:work-order:table:row-actions'), {
            name: 'fleet-ops:work-order:table:row-actions',
            prefix: 'fleet-ops:work-order:table',
            extension: 'fleet-ops',
            resource: 'work-order',
            surface: 'table',
            slot: 'row-actions',
            section: 'fleet-ops:work-order:table:row-actions',
            list: 'action',
        });
        assert.strictEqual(parseRegistryName('ledger:invoice:details:menu').list, 'action');
        assert.strictEqual(parseRegistryName('iam:user:details:actions').list, 'action-button');
        assert.strictEqual(parseRegistryName('developers:api-key:table:columns').list, 'table-column');
    });

    test('details tabs are an alias for the legacy tab registry', function (assert) {
        const parsed = parseRegistryName('fleet-ops:driver:details:tabs');

        assert.strictEqual(parsed.slot, 'tabs');
        assert.strictEqual(parsed.section, 'fleet-ops:component:driver:details', 'stored where tabs always were');
        assert.strictEqual(parsed.list, 'menu-item');
        assert.strictEqual(parseRegistryName('fleet-ops:driver:table:tabs'), null, 'tables have no tabs');
    });

    test('it rejects names that break the convention', function (assert) {
        [
            null,
            42,
            'fleet-ops:component:driver:details',
            'fleet-ops:driver:table',
            'fleet-ops:driver:table:column',
            'fleet-ops:driver:details:columns',
            'Fleet-Ops:table:driver:columns',
            'fleet-ops:driver:table:columns:extra',
            'fleet-ops:table:driver:columns', // the surface comes after the resource
            'fleet-ops::driver:columns',
        ].forEach((name) => assert.strictEqual(parseRegistryName(name), null, `${name} is rejected`));
    });

    test('it parses surface prefixes', function (assert) {
        assert.deepEqual(parseRegistryPrefix('ledger:invoice:details'), { prefix: 'ledger:invoice:details', extension: 'ledger', resource: 'invoice', surface: 'details' });
        assert.strictEqual(parseRegistryPrefix('ledger:details:invoice'), null, 'the surface comes after the resource');
        assert.strictEqual(parseRegistryPrefix('ledger:invoice:details:menu'), null);
        assert.strictEqual(parseRegistryPrefix('ledger:form:invoice'), null);
        assert.strictEqual(parseRegistryPrefix(undefined), null);
    });

    test('it builds names', function (assert) {
        assert.strictEqual(buildRegistryName('storefront', 'order', 'table', 'columns'), 'storefront:order:table:columns');
        assert.strictEqual(detailsTabsRegistryName('fleet-ops', 'driver'), 'fleet-ops:component:driver:details');
        assert.deepEqual(resourceRegistryNames('iam', 'user'), [
            'iam:user:table:columns',
            'iam:user:table:row-actions',
            'iam:user:table:bulk-actions',
            'iam:user:table:actions',
            'iam:user:details:actions',
            'iam:user:details:menu',
            'iam:user:details:tabs',
        ]);
        resourceRegistryNames('fleet-ops', 'work-order').forEach((name) => assert.ok(parseRegistryName(name), `${name} parses`));
    });
});

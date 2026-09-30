import { module, test } from 'qunit';
import { parseRegistryName, parseRegistryPrefix, buildRegistryName, resourceRegistryNames, detailsTabsRegistryName } from '@fleetbase/ember-core/utils/resource-view-registry';

module('Unit | Utility | resource-view-registry', function () {
    test('it parses a valid registry name into its segments', function (assert) {
        assert.deepEqual(parseRegistryName('fleet-ops:table:work-order:row-actions'), {
            name: 'fleet-ops:table:work-order:row-actions',
            prefix: 'fleet-ops:table:work-order',
            extension: 'fleet-ops',
            surface: 'table',
            resource: 'work-order',
            slot: 'row-actions',
            list: 'action',
        });
        assert.strictEqual(parseRegistryName('ledger:details:invoice:menu').list, 'action');
        assert.strictEqual(parseRegistryName('iam:details:user:actions').list, 'action-button');
        assert.strictEqual(parseRegistryName('developers:table:api-key:columns').list, 'table-column');
    });

    test('it rejects names that break the convention', function (assert) {
        [
            null,
            42,
            'fleet-ops:component:driver:details',
            'fleet-ops:table:driver',
            'fleet-ops:table:driver:column',
            'fleet-ops:details:driver:columns',
            'Fleet-Ops:table:driver:columns',
            'fleet-ops:table:driver:columns:extra',
            'fleet-ops::driver:columns',
        ].forEach((name) => assert.strictEqual(parseRegistryName(name), null, `${name} is rejected`));
    });

    test('it parses surface prefixes', function (assert) {
        assert.deepEqual(parseRegistryPrefix('ledger:details:invoice'), { prefix: 'ledger:details:invoice', extension: 'ledger', surface: 'details', resource: 'invoice' });
        assert.strictEqual(parseRegistryPrefix('ledger:details:invoice:menu'), null);
        assert.strictEqual(parseRegistryPrefix('ledger:form:invoice'), null);
        assert.strictEqual(parseRegistryPrefix(undefined), null);
    });

    test('it builds names', function (assert) {
        assert.strictEqual(buildRegistryName('storefront', 'table', 'order', 'columns'), 'storefront:table:order:columns');
        assert.strictEqual(detailsTabsRegistryName('fleet-ops', 'driver'), 'fleet-ops:component:driver:details');
        assert.deepEqual(resourceRegistryNames('iam', 'user'), [
            'iam:table:user:columns',
            'iam:table:user:row-actions',
            'iam:table:user:bulk-actions',
            'iam:table:user:actions',
            'iam:details:user:actions',
            'iam:details:user:menu',
        ]);
        resourceRegistryNames('fleet-ops', 'work-order').forEach((name) => assert.ok(parseRegistryName(name), `${name} parses`));
    });
});

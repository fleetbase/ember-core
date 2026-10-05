import * as contracts from '@fleetbase/ember-core/contracts';
import BaseContract from '@fleetbase/ember-core/contracts/base-contract';
import ExtensionComponent from '@fleetbase/ember-core/contracts/extension-component';
import MenuItem from '@fleetbase/ember-core/contracts/menu-item';
import MenuPanel from '@fleetbase/ember-core/contracts/menu-panel';
import Hook from '@fleetbase/ember-core/contracts/hook';
import Widget from '@fleetbase/ember-core/contracts/widget';
import Registry from '@fleetbase/ember-core/contracts/registry';
import { module, test } from 'qunit';

module('Unit | Contract | index', function () {
    test('it re-exports every contract class by name', function (assert) {
        assert.strictEqual(contracts.BaseContract, BaseContract);
        assert.strictEqual(contracts.ExtensionComponent, ExtensionComponent);
        assert.strictEqual(contracts.MenuItem, MenuItem);
        assert.strictEqual(contracts.MenuPanel, MenuPanel);
        assert.strictEqual(contracts.Hook, Hook);
        assert.strictEqual(contracts.Widget, Widget);
        assert.strictEqual(contracts.Registry, Registry);
    });

    test('the contract classes all descend from BaseContract', function (assert) {
        for (const name of ['ExtensionComponent', 'MenuItem', 'MenuPanel', 'Hook', 'Widget', 'Registry']) {
            assert.true(contracts[name].prototype instanceof BaseContract, `${name} extends BaseContract`);
        }
    });
});

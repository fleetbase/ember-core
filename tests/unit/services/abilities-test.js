import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import AbilitiesService from '@fleetbase/ember-core/services/abilities';

// ember-can ships its own app/services/abilities.js, which collides with this
// addon's re-export, so `service:abilities` does not reliably resolve to the
// subclass under test. Registering it explicitly pins the unit under test.
module('Unit | Service | abilities', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register('service:fleetbase-abilities', AbilitiesService);
        this.service = this.owner.lookup('service:fleetbase-abilities');
    });

    test('it routes every ability through the dynamic ability', function (assert) {
        assert.deepEqual(this.service.parse('view order'), { propertyName: 'view order', abilityName: 'dynamic' });
        assert.deepEqual(this.service.parse(''), { propertyName: '', abilityName: 'dynamic' });
    });

    test('it keeps the property name verbatim rather than splitting it', function (assert) {
        // ember-can would normally split "ability on model"; this override does not.
        assert.strictEqual(this.service.parse('create fleet-ops order').propertyName, 'create fleet-ops order');
    });
});

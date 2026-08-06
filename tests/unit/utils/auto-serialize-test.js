import autoSerialize from 'dummy/utils/auto-serialize';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr, belongsTo, hasMany } from '@ember-data/model';

module('Unit | Utility | auto-serialize', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        class DriverModel extends Model {
            @attr('string') name;
        }

        class VehicleModel extends Model {
            @attr('string') plate;
        }

        class FleetModel extends Model {
            @attr('string') name;
            @attr('string') colour;
            @belongsTo('vehicle', { async: false, inverse: null }) vehicle;
            @hasMany('driver', { async: false, inverse: null }) drivers;
        }

        this.owner.register('model:driver', DriverModel);
        this.owner.register('model:vehicle', VehicleModel);
        this.owner.register('model:fleet', FleetModel);
        this.store = this.owner.lookup('service:store');
    });

    test('it returns an empty object for anything that is not a model', function (assert) {
        assert.deepEqual(autoSerialize({ plain: true }), {});
        assert.deepEqual(autoSerialize(null), {});
        assert.deepEqual(autoSerialize('text'), {});
        assert.deepEqual(autoSerialize(42), {});
    });

    test('it maps an array of models', function (assert) {
        const records = [this.store.createRecord('driver', { name: 'A' }), this.store.createRecord('driver', { name: 'B' })];

        const serialized = autoSerialize(records);

        assert.strictEqual(serialized.length, 2);
        assert.deepEqual(
            serialized.map((entry) => entry.name),
            ['A', 'B']
        );
    });

    test('it serializes attributes and mirrors the id onto uuid', function (assert) {
        const record = this.store.createRecord('vehicle', { plate: 'XYZ-123' });

        const serialized = autoSerialize(record);

        assert.strictEqual(serialized.plate, 'XYZ-123');
        assert.strictEqual(serialized.uuid, serialized.id, 'uuid mirrors id');
    });

    test('it honours the except list', function (assert) {
        const record = this.store.createRecord('fleet', { name: 'North', colour: 'red' });

        const serialized = autoSerialize(record, ['colour']);

        assert.strictEqual(serialized.name, 'North');
        assert.notOk('colour' in serialized, 'excluded attributes are omitted');
    });

    test('it nulls empty relationships and empties hasMany collections', function (assert) {
        const record = this.store.createRecord('fleet', { name: 'Empty' });

        const serialized = autoSerialize(record);

        assert.strictEqual(serialized.vehicle, null, 'an unset belongsTo serializes to null');
        assert.strictEqual(serialized.drivers, null, 'an empty hasMany serializes to null');
    });

    test('it collapses a populated hasMany to an empty array', function (assert) {
        const record = this.store.createRecord('fleet', { name: 'Crewed' });
        record.drivers.push(this.store.createRecord('driver', { name: 'Driver' }));

        const serialized = autoSerialize(record);

        assert.deepEqual(serialized.drivers, [], 'populated hasMany relationships are not expanded');
    });

    test('it serializes a populated belongsTo relationship', function (assert) {
        const vehicle = this.store.createRecord('vehicle', { plate: 'AAA-000' });
        const record = this.store.createRecord('fleet', { name: 'Linked', vehicle });

        const serialized = autoSerialize(record);

        assert.strictEqual(serialized.vehicle.plate, 'AAA-000');
    });
});

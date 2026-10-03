import autoSerialize from 'dummy/utils/auto-serialize';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr, belongsTo, hasMany } from '@ember-data/model';
import { get } from '@ember/object';

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

        class ZoneModel extends Model {
            @attr('string') name;
            @belongsTo('vehicle', { async: false, inverse: null }) service_area;
        }

        this.owner.register('model:driver', DriverModel);
        this.owner.register('model:vehicle', VehicleModel);
        this.owner.register('model:fleet', FleetModel);
        this.owner.register('model:zone', ZoneModel);
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

    /**
     * A related record is meant to be serialized by trying `toJSON`, then
     * `toJson`, then `serialize` on it. None of those are ever called: the
     * dispatcher reads a property literally named `method` instead of the method
     * whose name it was handed.
     *
     *   const invoke = (context, method, ...params) => {
     *       if (typeof context.method === 'function') {   // not context[method]
     *           return context.method(...params);
     *       }
     *       return null;
     *   };
     *
     * So `invoke(model, 'toJSON')` asks whether `model.method` is a function.
     * The tests below pin that from both directions.
     */
    module('how a related record gets serialized', function (nested) {
        nested.beforeEach(function () {
            const testContext = this;

            class GadgetModel extends Model {
                @attr('string') label;

                toJSON() {
                    testContext.calledToJSON = true;
                    return { via: 'toJSON' };
                }

                // Deliberately named `method` — this is the only name the
                // dispatcher above will ever find.
                method() {
                    return testContext.methodResult;
                }
            }

            class HolderModel extends Model {
                @belongsTo('gadget', { async: false, inverse: null }) gadget;
            }

            this.owner.register('model:gadget', GadgetModel);
            this.owner.register('model:holder', HolderModel);

            this.calledToJSON = false;
            this.methodResult = { via: 'the property literally named method' };

            this.holderWithGadget = () => {
                const gadget = this.store.createRecord('gadget', { label: 'G' });
                return this.store.createRecord('holder', { gadget });
            };
        });

        test('toJSON on the related record is never called', function (assert) {
            const serialized = autoSerialize(this.holderWithGadget());

            assert.false(this.calledToJSON, 'the name it was asked for is ignored');
            assert.deepEqual(serialized.gadget, { via: 'the property literally named method' });
        });

        test('a record with no property called method falls through to a recursive walk', function (assert) {
            // vehicle has no `method`, so all three lookups miss and the related
            // record is serialized by autoSerialize itself. This is why the bug
            // has gone unnoticed — the fallback produces a reasonable result.
            const vehicle = this.store.createRecord('vehicle', { plate: 'BBB-111' });
            const record = this.store.createRecord('fleet', { vehicle });

            assert.strictEqual(autoSerialize(record).vehicle.plate, 'BBB-111');
        });

        test('an empty object from the dispatcher is rejected and the walk is used instead', function (assert) {
            // The emptiness check treats {} as empty even though isEmpty does not,
            // so a `method` returning {} is skipped for all three names.
            this.methodResult = {};

            const serialized = autoSerialize(this.holderWithGadget());

            assert.strictEqual(serialized.gadget.label, 'G', 'the recursive walk ran');
        });
    });

    /**
     * The two special cases for `fleet` and `zone` read the model name from
     * `_internalModel.modelName`, a private ember-data path that no longer exists
     * in 4.12 — so `modelName` is undefined and neither case can fire.
     */
    module('the fleet and zone except-list patches', function () {
        test('a real fleet record does not have drivers excluded', function (assert) {
            const record = this.store.createRecord('fleet', { name: 'North' });
            record.drivers.push(this.store.createRecord('driver', { name: 'D' }));

            const serialized = autoSerialize(record);

            assert.true('drivers' in serialized, 'the patch that would have removed it never runs');
        });

        test('_internalModel.modelName is gone in this ember-data version', function (assert) {
            const record = this.store.createRecord('fleet', { name: 'North' });

            assert.strictEqual(get(record, '_internalModel.modelName'), undefined, 'which is what makes the patch dead');
        });

        test('supplying that path restores the behaviour the patch intended', function (assert) {
            // Simulating what the removed private API used to provide, to show the
            // patch itself is correct and only its input is missing.
            const record = this.store.createRecord('fleet', { name: 'North' });
            record.drivers.push(this.store.createRecord('driver', { name: 'D' }));
            Object.defineProperty(record, '_internalModel', { value: { modelName: 'fleet' }, configurable: true });

            const serialized = autoSerialize(record);

            assert.false('drivers' in serialized, 'drivers is excluded once the model name resolves');
        });

        test('the same is true of the zone patch', function (assert) {
            const record = this.store.createRecord('zone', { name: 'Central' });
            Object.defineProperty(record, '_internalModel', { value: { modelName: 'zone' }, configurable: true });

            const serialized = autoSerialize(record);

            assert.false('service_area' in serialized, 'service_area is excluded once the model name resolves');
            assert.strictEqual(serialized.name, 'Central', 'and the rest still serializes');
        });

        test('the except list the caller passed is mutated by that patch', function (assert) {
            // The patch pushes onto the array it was given rather than a copy, so
            // a caller reusing one list across calls accumulates exclusions.
            const record = this.store.createRecord('fleet', { name: 'North' });
            Object.defineProperty(record, '_internalModel', { value: { modelName: 'fleet' }, configurable: true });
            const except = ['colour'];

            autoSerialize(record, except);

            assert.deepEqual(except, ['colour', 'drivers'], 'the caller list grew');
        });
    });
});

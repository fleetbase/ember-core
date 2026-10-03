import BaseContract from '@fleetbase/ember-core/contracts/base-contract';
import { module, test } from 'qunit';

module('Unit | Contract | base-contract', function () {
    test('it copies the options it is given rather than holding the reference', function (assert) {
        const options = { a: 1 };
        const contract = new BaseContract(options);

        options.a = 2;

        assert.strictEqual(contract.getOption('a'), 1, 'later mutation of the caller object does not leak in');
    });

    test('it defaults to an empty option set', function (assert) {
        assert.deepEqual(new BaseContract().getOptions(), {});
    });

    test('setOption stores a value and returns the contract for chaining', function (assert) {
        const contract = new BaseContract();

        assert.strictEqual(contract.setOption('a', 1), contract);
        assert.strictEqual(contract.getOption('a'), 1);
    });

    test('getOption falls back only for a missing key', function (assert) {
        const contract = new BaseContract({ empty: '', zero: 0, nullish: null, no: false });

        assert.strictEqual(contract.getOption('missing'), null, 'null is the default default');
        assert.strictEqual(contract.getOption('missing', 'fallback'), 'fallback');
        assert.strictEqual(contract.getOption('empty', 'fallback'), '');
        assert.strictEqual(contract.getOption('zero', 'fallback'), 0);
        assert.strictEqual(contract.getOption('nullish', 'fallback'), null);
        assert.false(contract.getOption('no', 'fallback'));
    });

    test('hasOption distinguishes a stored falsy value from a missing one', function (assert) {
        const contract = new BaseContract({ zero: 0, nullish: null });

        assert.true(contract.hasOption('zero'));
        assert.true(contract.hasOption('nullish'));
        assert.false(contract.hasOption('missing'));
    });

    test('removeOption deletes the key and returns the contract', function (assert) {
        const contract = new BaseContract({ a: 1 });

        assert.strictEqual(contract.removeOption('a'), contract);
        assert.false(contract.hasOption('a'));
    });

    test('removeOption is safe for a key that was never set', function (assert) {
        const contract = new BaseContract();

        assert.strictEqual(contract.removeOption('missing'), contract);
    });

    test('toObject and getOptions return copies', function (assert) {
        const contract = new BaseContract({ a: 1 });

        const asObject = contract.toObject();
        asObject.a = 99;

        assert.strictEqual(contract.getOption('a'), 1, 'toObject hands back a copy');

        const options = contract.getOptions();
        options.a = 99;

        assert.strictEqual(contract.getOption('a'), 1, 'getOptions hands back a copy');
    });

    test('setup runs validation, which is a no-op on the base class', function (assert) {
        const contract = new BaseContract();

        contract.setup();

        assert.true(true, 'base setup completes without throwing');
    });

    test('setup surfaces a subclass validation failure', function (assert) {
        class Strict extends BaseContract {
            validate() {
                throw new Error('always invalid');
            }
        }

        assert.throws(() => new Strict().setup(), /always invalid/);
    });
});

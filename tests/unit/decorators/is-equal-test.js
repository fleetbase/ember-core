import { isEqual } from '@fleetbase/ember-core/decorators/is-equal';
import { module, test } from 'qunit';
import EmberObject, { set } from '@ember/object';

/**
 * NOTE — this decorator does not work on Ember 5.4 with ember-decorators 6, and
 * these tests pin what it actually does rather than what it is meant to do.
 *
 * The decorated property reads back as `undefined` no matter what the two source
 * properties hold. The inner function hands a ComputedProperty back to
 * decoratorWithRequiredParams, which expects a property descriptor, so nothing is
 * installed on the class. (Its parameter list is also mislabelled — it declares
 * `(target, desc, key, params)` where the caller passes `(target, key, desc,
 * params)` — harmless today only because those two are never used.)
 *
 * Fixing it means deciding how the property should be defined, which is a
 * maintainer's call, so nothing is changed here. These tests will fail as soon as
 * somebody makes it work, which is the point at which that decision gets made.
 */
class Subject extends EmberObject {
    @isEqual('a', 'b') matches;
}

module('Unit | Decorator | is-equal', function () {
    test('the decorated property is undefined even when the values match', function (assert) {
        assert.strictEqual(Subject.create({ a: 'x', b: 'x' }).matches, undefined);
    });

    test('it is equally undefined when the values differ', function (assert) {
        assert.strictEqual(Subject.create({ a: 'x', b: 'y' }).matches, undefined);
    });

    test('it stays undefined after either dependent property changes', function (assert) {
        const subject = Subject.create({ a: 'x', b: 'y' });

        set(subject, 'b', 'x');
        assert.strictEqual(subject.matches, undefined);

        set(subject, 'a', 'z');
        assert.strictEqual(subject.matches, undefined);
    });

    test('the decorator itself is a function that accepts two property names', function (assert) {
        assert.strictEqual(typeof isEqual, 'function');
        assert.strictEqual(typeof isEqual('a', 'b'), 'function', 'it returns a decorator');
    });

    test('fewer than two property names is rejected', function (assert) {
        assert.throws(() => isEqual('a')({}, 'matches', {}), /requires two property names/);
    });

    /**
     * The comparison the decorator builds is correct — it is only the installation
     * that fails. Applying the decorator by hand yields the ComputedProperty it
     * meant to define, and installing THAT through `.extend()` behaves exactly as
     * the decorator was supposed to.
     *
     * This is the useful half of the finding: whoever fixes the decorator does not
     * need to rewrite the comparison, only to define the property properly.
     */
    module('the computed property it builds', function () {
        const buildComputed = () => isEqual('a', 'b')({}, 'matches', {});

        test('it compares the two named properties', function (assert) {
            const Working = EmberObject.extend({ matches: buildComputed() });

            assert.true(Working.create({ a: 'x', b: 'x' }).matches);
            assert.false(Working.create({ a: 'x', b: 'y' }).matches);
        });

        test('it compares by identity, not by value', function (assert) {
            const Working = EmberObject.extend({ matches: buildComputed() });

            assert.false(Working.create({ a: {}, b: {} }).matches, 'two equivalent objects are not equal');
            assert.false(Working.create({ a: 1, b: '1' }).matches, 'and no coercion happens');
        });

        test('it recomputes when either property changes', function (assert) {
            const subject = EmberObject.extend({ matches: buildComputed() }).create({ a: 'x', b: 'y' });

            assert.false(subject.matches);

            set(subject, 'b', 'x');
            assert.true(subject.matches);

            set(subject, 'a', 'z');
            assert.false(subject.matches);
        });

        test('two undefined properties count as equal', function (assert) {
            assert.true(EmberObject.extend({ matches: buildComputed() }).create().matches);
        });
    });
});

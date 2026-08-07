import getModelName from 'dummy/utils/get-model-name';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Model, { attr } from '@ember-data/model';

/**
 * getModelName resolves a display name for a model, falling back to a supplied
 * default (or the first non-blank entry of a list of defaults) when the value
 * is not a model at all. The `options` flags then reshape whatever it settled on.
 */
module('Unit | Utility | get-model-name', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.owner.register(
            'model:fuel-report',
            class extends Model {
                @attr('string') name;
            }
        );

        this.store = this.owner.lookup('service:store');
        this.record = () => this.store.createRecord('fuel-report', {});
    });

    module('fallbacks', function () {
        test('with nothing to go on it returns null', function (assert) {
            assert.strictEqual(getModelName(), null);
        });

        test('a non-model returns the fallback unchanged', function (assert) {
            assert.strictEqual(getModelName({ not: 'a model' }, 'order'), 'order');
        });

        test('a list of fallbacks yields the first non-blank entry', function (assert) {
            // Regression: `isArray` is true for a native array, and the loop
            // used `objectAt`, which does not exist on one once prototype
            // extensions are off — every list fallback threw a TypeError.
            assert.strictEqual(getModelName(null, ['order', 'vehicle']), 'order');
        });

        test('blank entries are skipped', function (assert) {
            assert.strictEqual(getModelName(null, [null, '', '   ', 'vehicle']), 'vehicle');
        });

        test('an all-blank list leaves the name unresolved', function (assert) {
            assert.strictEqual(getModelName(null, [null, '']), undefined);
        });

        test('an empty list leaves the name unresolved', function (assert) {
            assert.strictEqual(getModelName(null, []), undefined);
        });
    });

    module('models', function () {
        test('a model reports its own model name, ignoring the fallback', function (assert) {
            assert.strictEqual(getModelName(this.record(), 'ignored'), 'fuel-report');
        });

        test('a model wins over a list of fallbacks too', function (assert) {
            assert.strictEqual(getModelName(this.record(), ['order', 'vehicle']), 'fuel-report');
        });
    });

    module('options', function () {
        test('humanize turns the dasherized name into words', function (assert) {
            assert.strictEqual(getModelName(this.record(), null, { humanize: true }), 'Fuel report');
        });

        test('lowercase lowers the whole name', function (assert) {
            assert.strictEqual(getModelName(null, 'Fuel Report', { lowercase: true }), 'fuel report');
        });

        test('capitalize raises only the first letter', function (assert) {
            assert.strictEqual(getModelName(null, 'fuel report', { capitalize: true }), 'Fuel report');
        });

        test('capitalizeWords raises every word', function (assert) {
            assert.strictEqual(getModelName(null, 'fuel report', { capitalizeWords: true }), 'Fuel Report');
        });

        test('the flags compose in order', function (assert) {
            assert.strictEqual(getModelName(this.record(), null, { humanize: true, capitalizeWords: true }), 'Fuel Report');
        });

        test('a flag set to anything but true is ignored', function (assert) {
            assert.strictEqual(getModelName(null, 'Fuel Report', { lowercase: 'yes' }), 'Fuel Report');
        });
    });
});

import TemplateHelper from '@fleetbase/ember-core/contracts/template-helper';
import { module, test } from 'qunit';

module('Unit | Contract | template-helper', function () {
    module('construction from a path', function () {
        test('it takes the last segment of the path as the name', function (assert) {
            const helper = new TemplateHelper('fleet-ops', 'helpers/format-distance');

            assert.strictEqual(helper.engineName, 'fleet-ops');
            assert.strictEqual(helper.path, 'helpers/format-distance');
            assert.strictEqual(helper.name, 'format-distance');
            assert.strictEqual(helper.class, null);
            assert.false(helper.isClass);
        });

        test('a path with no separator is used whole', function (assert) {
            assert.strictEqual(new TemplateHelper('fleet-ops', 'humanize').name, 'humanize');
        });

        test('a deeply nested path still resolves to its final segment', function (assert) {
            assert.strictEqual(new TemplateHelper('fleet-ops', 'a/b/c/format-money').name, 'format-money');
        });
    });

    module('construction from a class', function () {
        test('it converts a PascalCase name to kebab-case and drops the Helper suffix', function (assert) {
            class FormatDistanceHelper {}
            const helper = new TemplateHelper('fleet-ops', FormatDistanceHelper);

            assert.strictEqual(helper.class, FormatDistanceHelper);
            assert.true(helper.isClass);
            assert.strictEqual(helper.path, null);
            assert.strictEqual(helper.name, 'format-distance-');
        });

        test('a name without the Helper suffix keeps every segment', function (assert) {
            class FormatDistance {}

            assert.strictEqual(new TemplateHelper('fleet-ops', FormatDistance).name, 'format-distance');
        });

        test('consecutive capitals are split before the trailing word', function (assert) {
            class HTMLParser {}

            assert.strictEqual(new TemplateHelper('fleet-ops', HTMLParser).name, 'html-parser');
        });

        test('a single-word class becomes its lowercase form', function (assert) {
            class Humanize {}

            assert.strictEqual(new TemplateHelper('fleet-ops', Humanize).name, 'humanize');
        });

        test('a named function is treated the same as a class', function (assert) {
            function formatMoney() {}

            const helper = new TemplateHelper('fleet-ops', formatMoney);
            assert.true(helper.isClass);
            assert.strictEqual(helper.name, 'format-money');
        });

        test('an anonymous function has no derivable name', function (assert) {
            const helper = new TemplateHelper(
                'fleet-ops',
                Object.defineProperty(() => {}, 'name', { value: '' })
            );

            assert.strictEqual(helper.name, null);
        });
    });
});

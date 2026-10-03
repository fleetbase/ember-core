import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import EmberObject from '@ember/object';

/**
 * bulkAction opens a confirmation modal listing the selected records and hands
 * it a `remove` callback so the user can drop rows before confirming.
 *
 * The modal itself is not exercised here — the service's contract with it is:
 * which template it shows, and what options it passes. A stubbed modals manager
 * captures those.
 */
function record(id, name) {
    return EmberObject.create({ id, name, constructor: { modelName: 'order' } });
}

module('Unit | Service | crud (bulkAction)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.shown = [];
        const testContext = this;

        this.owner.register(
            'service:modals-manager',
            class extends Service {
                show(template, options) {
                    testContext.shown.push({ template, options });
                    this.options = options;
                    return Promise.resolve();
                }
                setOption(key, value) {
                    this.options[key] = value;
                }
                getOption(key, fallback = null) {
                    return this.options?.[key] ?? fallback;
                }
            }
        );

        this.owner.register('service:fetch', class extends Service {});
        this.owner.register('service:notifications', class extends Service {});
        this.owner.register('service:store', class extends Service {});

        this.service = this.owner.lookup('service:crud');
        this.modals = this.owner.lookup('service:modals-manager');
        this.lastOptions = () => this.shown.at(-1).options;
    });

    test('it does nothing without a selection', function (assert) {
        assert.strictEqual(this.service.bulkAction('delete', []), undefined);
        assert.strictEqual(this.service.bulkAction('delete', null), undefined);
        assert.strictEqual(this.service.bulkAction('delete', 'not an array'), undefined);
        assert.deepEqual(this.shown, [], 'no modal is opened');
    });

    test('it opens the bulk action modal with the selection and count', function (assert) {
        const selected = [record('1', 'A'), record('2', 'B')];

        this.service.bulkAction('delete', selected);

        const { template, options } = this.shown[0];
        assert.strictEqual(template, 'modals/bulk-action-model');
        assert.strictEqual(options.count, 2);
        assert.deepEqual(options.selected, selected);
        assert.strictEqual(options.verb, 'delete');
    });

    test('a custom template is honoured', function (assert) {
        this.service.bulkAction('archive', [record('1', 'A')], { template: 'modals/custom' });

        assert.strictEqual(this.shown[0].template, 'modals/custom');
    });

    test('resolveModelName is applied to every record', function (assert) {
        const selected = [record('1', 'A'), record('2', 'B')];

        this.service.bulkAction('delete', selected, { resolveModelName: (model) => `Order ${model.name}` });

        assert.deepEqual(
            this.lastOptions().selected.map((model) => model.list_resolved_name),
            ['Order A', 'Order B']
        );
    });

    test('resolveModelName returning a non-string leaves the record alone', function (assert) {
        const selected = [record('1', 'A')];

        this.service.bulkAction('delete', selected, { resolveModelName: () => null });

        assert.strictEqual(this.lastOptions().selected[0].list_resolved_name, undefined);
    });

    test('remove drops a record from the selection', function (assert) {
        const [first, second] = [record('1', 'A'), record('2', 'B')];

        this.service.bulkAction('delete', [first, second]);
        this.lastOptions().remove(first);

        assert.deepEqual(this.modals.getOption('selected'), [second], 'the removed record is gone and the rest survive');
    });

    test('remove works after resolveModelName has replaced the array', function (assert) {
        // Regression: resolveModelName maps the selection, producing a plain
        // array, and remove used to call removeObject on it — which does not
        // exist on a native array once prototype extensions are off.
        const [first, second] = [record('1', 'A'), record('2', 'B')];

        this.service.bulkAction('delete', [first, second], { resolveModelName: (model) => model.name });
        this.lastOptions().remove(first);

        assert.deepEqual(this.modals.getOption('selected'), [second]);
    });

    test('removing every record leaves an empty selection', function (assert) {
        const [first, second] = [record('1', 'A'), record('2', 'B')];

        this.service.bulkAction('delete', [first, second]);
        const { remove } = this.lastOptions();
        remove(first);
        remove(second);

        assert.deepEqual(this.modals.getOption('selected'), []);
    });

    test('removing a record that is not selected changes nothing', function (assert) {
        const selected = [record('1', 'A')];

        this.service.bulkAction('delete', selected);
        this.lastOptions().remove(record('99', 'Z'));

        assert.strictEqual(this.modals.getOption('selected').length, 1);
    });
});

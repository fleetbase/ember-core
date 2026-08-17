import { module, test } from 'qunit';
import Widget from '@fleetbase/ember-core/contracts/widget';

/**
 * withTitle and withRefreshInterval used to open with
 * `if (!this.options) { this.options = {}; }`. The constructor already assigns
 * `this.options` on both of its paths — `definition.options || {}` for a
 * definition object, and `{}` for a bare id — so neither guard could ever fire.
 * They have been removed; the tests below are what guarantee the constructor
 * keeps holding up its end.
 */
module('Unit | Contract | widget (options setters)', function () {
    test('a widget built from a bare id already has an options bag', function (assert) {
        assert.deepEqual(new Widget('orders-summary').options, {}, 'which is what the setters rely on');
    });

    test('a widget built from a definition with no options has one too', function (assert) {
        assert.deepEqual(new Widget({ id: 'orders-summary', name: 'Orders' }).options, {});
    });

    test('withTitle stores the title and chains', function (assert) {
        const widget = new Widget('orders-summary');

        const returned = widget.withTitle('Orders');

        assert.strictEqual(returned, widget, 'it chains');
        assert.strictEqual(widget.options.title, 'Orders');
        assert.strictEqual(widget.toObject().options.title, 'Orders');
    });

    test('withTitle keeps an options bag that came from the definition', function (assert) {
        const widget = new Widget({ id: 'orders-summary', options: { existing: true } });

        widget.withTitle('Orders');

        assert.strictEqual(widget.options.existing, true, 'nothing already there is lost');
        assert.strictEqual(widget.options.title, 'Orders');
    });

    test('withRefreshInterval stores the interval and chains', function (assert) {
        const widget = new Widget('orders-summary');

        const returned = widget.withRefreshInterval(30000);

        assert.strictEqual(returned, widget);
        assert.strictEqual(widget.options.refreshInterval, 30000);
        assert.strictEqual(widget.toObject().options.refreshInterval, 30000);
    });

    test('the two setters compose', function (assert) {
        const widget = new Widget('orders-summary').withTitle('Orders').withRefreshInterval(5000);

        assert.deepEqual(widget.toObject().options, { title: 'Orders', refreshInterval: 5000 });
    });
});

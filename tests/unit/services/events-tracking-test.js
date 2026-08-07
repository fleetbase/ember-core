import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import config from 'dummy/config/environment';

/**
 * The trackers the sibling events test does not reach — import, export and
 * bulk action — plus the property enrichment every tracker runs through.
 *
 * `config` is shared across the whole run, so `config.events` is deleted after
 * each test rather than reassigned.
 */
module('Unit | Service | events (tracking)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.universeEvents = [];
        const testContext = this;

        this.owner.register(
            'service:universe',
            class extends Service {
                trigger(name, ...args) {
                    testContext.universeEvents.push({ name, args });
                }
            }
        );

        this.owner.register('service:current-user', class extends Service {});

        this.service = this.owner.lookup('service:events');
        this.service.trigger = () => {};

        this.names = () => this.universeEvents.map((event) => event.name);
        this.propsOf = (name) => this.universeEvents.find((event) => event.name === name)?.args.at(-1);
    });

    hooks.afterEach(function () {
        delete config.events;
    });

    module('imports', function () {
        test('it emits the import event with the model and count', function (assert) {
            this.service.trackResourceImported('order', 12);

            assert.deepEqual(this.names(), ['resource.imported']);
            const [modelName, count] = this.universeEvents[0].args;
            assert.strictEqual(modelName, 'order');
            assert.strictEqual(count, 12);
        });

        test('the properties carry the model and count too', function (assert) {
            this.service.trackResourceImported('order', 12);

            const props = this.propsOf('resource.imported');
            assert.strictEqual(props.model_name, 'order');
            assert.strictEqual(props.count, 12);
        });

        test('extra properties are merged in', function (assert) {
            this.service.trackResourceImported('order', 1, { source: 'spreadsheet' });

            assert.strictEqual(this.propsOf('resource.imported').source, 'spreadsheet');
        });
    });

    module('exports', function () {
        test('it emits both a generic and a model-specific event', function (assert) {
            this.service.trackResourceExported('order', 'csv');

            assert.deepEqual(this.names(), ['resource.exported', 'order.exported']);
        });

        test('the format is recorded', function (assert) {
            this.service.trackResourceExported('order', 'xlsx');

            assert.strictEqual(this.propsOf('resource.exported').export_format, 'xlsx');
        });

        test('it records whether the export was filtered', function (assert) {
            this.service.trackResourceExported('order', 'csv', { status: 'active' });
            assert.true(this.propsOf('resource.exported').has_filters);

            this.universeEvents.length = 0;
            this.service.trackResourceExported('order', 'csv', {});
            assert.false(this.propsOf('resource.exported').has_filters, 'an empty filter set is not a filter');
        });

        test('absent params count as unfiltered', function (assert) {
            this.service.trackResourceExported('order', 'csv', null);

            assert.false(this.propsOf('resource.exported').has_filters);
        });
    });

    module('bulk actions', function () {
        test('it records the verb, the count and the model', function (assert) {
            const resources = [{ constructor: { modelName: 'order' } }, { constructor: { modelName: 'order' } }];

            this.service.trackBulkAction('delete', resources);

            assert.deepEqual(this.names(), ['resource.bulk_action']);
            const props = this.propsOf('resource.bulk_action');
            assert.strictEqual(props.action, 'delete');
            assert.strictEqual(props.count, 2);
            assert.strictEqual(props.model_name, 'order', 'taken from the first resource');
        });

        test('the event carries the verb, the resources and the first of them', function (assert) {
            const first = { constructor: { modelName: 'order' } };

            this.service.trackBulkAction('archive', [first]);

            const [verb, resources, firstResource] = this.universeEvents[0].args;
            assert.strictEqual(verb, 'archive');
            assert.deepEqual(resources, [first]);
            assert.strictEqual(firstResource, first);
        });

        test('an empty selection reports a count of zero and an unknown model', function (assert) {
            this.service.trackBulkAction('delete', []);

            const props = this.propsOf('resource.bulk_action');
            assert.strictEqual(props.count, 0);
            assert.strictEqual(props.model_name, 'unknown');
        });

        test('a missing selection is tolerated', function (assert) {
            this.service.trackBulkAction('delete', null);

            assert.strictEqual(this.propsOf('resource.bulk_action').count, 0);
        });
    });

    module('property enrichment', function () {
        test('a timestamp is added by default', function (assert) {
            this.service.trackEvent('custom.event');

            assert.ok(this.propsOf('custom.event').timestamp, 'an ISO timestamp');
        });

        test('the timestamp can be switched off', function (assert) {
            config.events = { enrich: { timestamp: false } };

            this.service.trackEvent('custom.event');

            assert.strictEqual(this.propsOf('custom.event').timestamp, undefined);
        });

        test('the user id is added when there is a user', function (assert) {
            this.service.currentUser.user = { id: 'user-1' };

            this.service.trackEvent('custom.event');

            assert.strictEqual(this.propsOf('custom.event').user_id, 'user-1');
        });

        test('the user context can be switched off', function (assert) {
            this.service.currentUser.user = { id: 'user-1' };
            config.events = { enrich: { user: false } };

            this.service.trackEvent('custom.event');

            assert.strictEqual(this.propsOf('custom.event').user_id, undefined);
        });

        test('the organization id is added when there is one', function (assert) {
            this.service.currentUser.organization = { id: 'company-1' };

            this.service.trackEvent('custom.event');

            assert.strictEqual(this.propsOf('custom.event').organization_id, 'company-1');
        });

        test('the organization context can be switched off', function (assert) {
            this.service.currentUser.organization = { id: 'company-1' };
            config.events = { enrich: { organization: false } };

            this.service.trackEvent('custom.event');

            assert.strictEqual(this.propsOf('custom.event').organization_id, undefined);
        });

        test('only an explicit false disables an enrichment', function (assert) {
            this.service.currentUser.user = { id: 'user-1' };
            config.events = { enrich: { user: 'no' } };

            this.service.trackEvent('custom.event');

            assert.strictEqual(this.propsOf('custom.event').user_id, 'user-1');
        });

        test('supplied properties survive enrichment', function (assert) {
            this.service.trackEvent('custom.event', { custom: 'value' });

            assert.strictEqual(this.propsOf('custom.event').custom, 'value');
        });
    });
});

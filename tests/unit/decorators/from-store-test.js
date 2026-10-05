import fromStore from '@fleetbase/ember-core/decorators/from-store';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';

// The decorator resolves its query lazily on first read, so each subject class is
// declared once at module scope and instantiated per test with an owner.
class Simple extends EmberObject {
    @fromStore('widget') records;
}

class WithQuery extends EmberObject {
    @fromStore('widget', { active: true }) records;
}

module('Unit | Decorator | from-store', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.queries = [];
        this.response = ['record-a', 'record-b'];
        const testContext = this;

        this.owner.register(
            'service:store',
            class extends Service {
                query(modelName, query, options) {
                    testContext.queries.push({ modelName, query, options });
                    return testContext.response instanceof Error ? Promise.reject(testContext.response) : Promise.resolve(testContext.response);
                }
            }
        );
    });

    test('it queries the store on first access and assigns the result', async function (assert) {
        const subject = WithQuery.create(this.owner.ownerInjection());

        subject.records;
        await settled();

        assert.strictEqual(this.queries.length, 1);
        assert.strictEqual(this.queries[0].modelName, 'widget');
        assert.deepEqual(this.queries[0].query, { active: true });
        assert.deepEqual(subject.records, ['record-a', 'record-b']);
    });

    test('it queries only once, serving the cached value afterwards', async function (assert) {
        const subject = Simple.create(this.owner.ownerInjection());

        subject.records;
        await settled();
        subject.records;
        await settled();

        assert.strictEqual(this.queries.length, 1);
    });

    test('it defaults the query and options', async function (assert) {
        const subject = Simple.create(this.owner.ownerInjection());

        subject.records;
        await settled();

        assert.deepEqual(this.queries[0].query, {});
        assert.deepEqual(this.queries[0].options, {});
    });

    test('it assigns null when the query rejects', async function (assert) {
        this.response = new Error('store is unavailable');
        const subject = Simple.create(this.owner.ownerInjection());

        subject.records;
        await settled();

        assert.strictEqual(subject.records, null);
    });

    test('an explicitly assigned value is used without querying', async function (assert) {
        const subject = Simple.create(this.owner.ownerInjection());

        subject.records = ['preset'];
        await settled();

        assert.deepEqual(subject.records, ['preset']);
        assert.strictEqual(this.queries.length, 0, 'the store is never consulted');
    });
});

import legacyFromStore from '@fleetbase/ember-core/decorators/legacy-from-store';
import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';

// NOTE: addon/decorators/legacy-from-store.js is byte-for-byte identical to
// addon/decorators/from-store.js. Both are exported, so both are covered here,
// but one of them is redundant and the pair will drift apart the first time only
// one is edited. Consolidating them is a maintainer's call.
class Subject extends EmberObject {
    @legacyFromStore('widget', { active: true }) records;
}

module('Unit | Decorator | legacy-from-store', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.queries = [];
        this.response = ['legacy-a'];
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

    test('it queries the store lazily and assigns the result', async function (assert) {
        const subject = Subject.create(this.owner.ownerInjection());

        subject.records;
        await settled();

        assert.deepEqual(this.queries, [{ modelName: 'widget', query: { active: true }, options: {} }]);
        assert.deepEqual(subject.records, ['legacy-a']);
    });

    test('it caches after the first read', async function (assert) {
        const subject = Subject.create(this.owner.ownerInjection());

        subject.records;
        await settled();
        subject.records;
        await settled();

        assert.strictEqual(this.queries.length, 1);
    });

    test('it assigns null when the query rejects', async function (assert) {
        this.response = new Error('unavailable');
        const subject = Subject.create(this.owner.ownerInjection());

        subject.records;
        await settled();

        assert.strictEqual(subject.records, null);
    });

    test('an assigned value bypasses the store', async function (assert) {
        const subject = Subject.create(this.owner.ownerInjection());

        subject.records = ['preset'];
        await settled();

        assert.deepEqual(subject.records, ['preset']);
        assert.strictEqual(this.queries.length, 0);
    });

    test('the query and options arguments both default when only a model name is given', async function (assert) {
        class Minimal extends EmberObject {
            @legacyFromStore('widget') records;
        }

        Minimal.create(this.owner.ownerInjection()).records;
        await settled();

        assert.deepEqual(this.queries, [{ modelName: 'widget', query: {}, options: {} }], 'an empty query and empty options are passed through');
    });
});

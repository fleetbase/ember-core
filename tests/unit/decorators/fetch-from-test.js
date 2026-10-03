import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setOwner } from '@ember/application';
import fetchFrom from 'dummy/decorators/fetch-from';

/**
 * @fetchFrom turns a property into a lazily-fetched one: the first read starts
 * the request and writes the result back onto the property, so later reads are
 * served from the cached value rather than refetching.
 */
module('Unit | Decorator | fetch-from', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.calls = [];
        this.response = { data: 'value' };
        this.shouldReject = false;
        const testContext = this;

        this.owner.register(
            'service:fetch',
            class extends Service {
                get(path, query, options) {
                    testContext.calls.push({ path, query, options });
                    return testContext.shouldReject ? Promise.reject(new Error('offline')) : Promise.resolve(testContext.response);
                }
            }
        );

        this.build = (Klass) => {
            const instance = Klass.create();
            setOwner(instance, this.owner);
            return instance;
        };
    });

    test('reading the property issues the request', async function (assert) {
        class Host extends EmberObject {
            @fetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        await host.data;

        assert.deepEqual(this.calls, [{ path: 'some/endpoint', query: {}, options: {} }]);
    });

    test('the query and options are passed through', async function (assert) {
        class Host extends EmberObject {
            @fetchFrom('some/endpoint', { limit: 5 }, { headers: { 'X-A': '1' } }) data;
        }
        const host = this.build(Host);

        await host.data;

        assert.deepEqual(this.calls[0].query, { limit: 5 });
        assert.deepEqual(this.calls[0].options, { headers: { 'X-A': '1' } });
    });

    test('the first read resolves before the value has landed', async function (assert) {
        class Host extends EmberObject {
            @fetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        assert.strictEqual(await host.data, undefined, 'the first read starts the fetch rather than returning it');
    });

    test('once fetched, the value is served from the property', async function (assert) {
        class Host extends EmberObject {
            @fetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        await host.data;

        assert.strictEqual(await host.data, this.response);
    });

    test('the request is only issued once', async function (assert) {
        class Host extends EmberObject {
            @fetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        await host.data;
        await host.data;
        await host.data;

        assert.strictEqual(this.calls.length, 1);
    });

    test('an assigned value is returned without any request', async function (assert) {
        class Host extends EmberObject {
            @fetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        host.data = 'preset';

        assert.strictEqual(await host.data, 'preset');
        assert.deepEqual(this.calls, [], 'nothing was fetched');
    });

    test('an onComplete hook receives the response and the instance', async function (assert) {
        const seen = [];
        class Host extends EmberObject {
            @fetchFrom('some/endpoint', {}, { onComplete: (response, instance) => seen.push({ response, instance }) }) data;
        }
        const host = this.build(Host);

        await host.data;

        assert.deepEqual(seen, [{ response: this.response, instance: host }]);
    });

    test('a failed request leaves the property null rather than rejecting', async function (assert) {
        this.shouldReject = true;
        class Host extends EmberObject {
            @fetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        await host.data;

        assert.strictEqual(await host.data, null);
    });

    test('the endpoint must be a string', function (assert) {
        assert.throws(() => {
            class Host extends EmberObject {
                @fetchFrom(42) data;
            }
            this.build(Host);
        }, /first argument of the @fetchFrom decorator must be a string/);
    });

    test('it requires at least an endpoint', function (assert) {
        assert.throws(() => {
            class Host extends EmberObject {
                @fetchFrom data;
            }
            this.build(Host);
        });
    });
});

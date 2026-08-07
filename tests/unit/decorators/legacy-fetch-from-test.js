import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { run } from '@ember/runloop';
import legacyFetchFrom from 'dummy/decorators/legacy-fetch-from';

/**
 * The legacy form fetches eagerly instead of lazily: it wraps `init` and
 * schedules the request for afterRender, writing the result onto the property
 * when it lands. Until then the property reads as null.
 *
 * `run(() => {})` flushes the afterRender queue; a macrotask tick then lets the
 * fetch promise settle.
 */
function flush() {
    run(() => {});
    return new Promise((resolve) => setTimeout(resolve, 0));
}

module('Unit | Decorator | legacy-fetch-from', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.calls = [];
        this.response = ['a', 'b'];
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

        this.build = (Klass) => Klass.create(this.owner.ownerInjection());
    });

    test('on a native class field the property starts undefined, not null', function (assert) {
        // Worth knowing before relying on `=== null` as "not loaded yet".
        // The decorator defines a symbol-backed accessor on the prototype and
        // seeds it with null, but a native class field installs an own property
        // on the instance, which shadows that accessor. The seeded null is
        // therefore never observed. This decorator predates native class
        // fields — it wraps `init`, so it was written for `.extend()` classes,
        // where the accessor is not shadowed and the null default does apply.
        class Host extends EmberObject {
            @legacyFetchFrom('some/endpoint') data;
        }

        assert.strictEqual(this.build(Host).data, undefined, 'the instance field shadows the seeded null');
    });

    test('the request is issued after render and the result assigned', async function (assert) {
        class Host extends EmberObject {
            @legacyFetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        await flush();

        assert.deepEqual(this.calls, [{ path: 'some/endpoint', query: {}, options: {} }]);
        assert.strictEqual(host.data, this.response);
    });

    test('the query and options are passed through', async function (assert) {
        class Host extends EmberObject {
            @legacyFetchFrom('some/endpoint', { limit: 5 }, { headers: { 'X-A': '1' } }) data;
        }
        this.build(Host);

        await flush();

        assert.deepEqual(this.calls[0].query, { limit: 5 });
        assert.deepEqual(this.calls[0].options, { headers: { 'X-A': '1' } });
    });

    test('a failed request leaves an empty list rather than rejecting', async function (assert) {
        this.shouldReject = true;
        class Host extends EmberObject {
            @legacyFetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);

        await flush();

        assert.deepEqual(host.data, [], 'callers can still iterate it');
    });

    test('the property remains assignable', async function (assert) {
        class Host extends EmberObject {
            @legacyFetchFrom('some/endpoint') data;
        }
        const host = this.build(Host);
        await flush();

        host.data = 'replaced';

        assert.strictEqual(host.data, 'replaced');
    });

    test('the inherited init still runs, so create() properties are applied', async function (assert) {
        // The decorator replaces `target.init` with a wrapper that calls the
        // original. EmberObject's own init is what assigns create() arguments,
        // so this would silently break if the wrapper dropped it.
        class Host extends EmberObject {
            @legacyFetchFrom('some/endpoint') data;
        }

        const host = Host.create(this.owner.ownerInjection(), { label: 'given' });
        await flush();

        assert.strictEqual(host.label, 'given');
        assert.strictEqual(host.data, this.response, 'and the fetch still happened');
    });

    test('the endpoint must be a string', function (assert) {
        assert.throws(() => legacyFetchFrom(42), /first argument of the @fetchFrom decorator must be a string/);
    });

    test('the query must be an object', function (assert) {
        assert.throws(() => legacyFetchFrom('some/endpoint', 'nope'), /second argument of the @fetchFrom decorator must be an object/);
    });

    test('the options must be an object', function (assert) {
        assert.throws(() => legacyFetchFrom('some/endpoint', {}, 'nope'), /third argument of the @fetchFrom decorator must be an object/);
    });
});

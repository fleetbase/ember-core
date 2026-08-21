import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import Service from '@ember/service';
import TemplateHelper from '@fleetbase/ember-core/contracts/template-helper';

/**
 * registerHelper puts a helper on the root container so every engine can use
 * it. It takes three shapes: a plain function, a TemplateHelper wrapping a
 * class, and a TemplateHelper naming a path inside an engine — the last of
 * which has to load that engine first.
 *
 * The seams are the application instance (settable) and the extension manager
 * (a stubbed service), so none of this needs a real engine.
 */
module('Unit | Service | universe/registry-service (helpers)', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.registered = [];
        this.engineInstance = null;
        this.ensureRejects = false;
        this.resolved = null;
        const testContext = this;

        this.owner.register(
            'service:universe/extension-manager',
            class extends Service {
                ensureEngineLoaded(engineName) {
                    testContext.requestedEngine = engineName;
                    if (testContext.ensureRejects) {
                        return Promise.reject(new Error('engine boom'));
                    }
                    return Promise.resolve(testContext.engineInstance);
                }
            }
        );

        this.service = this.owner.lookup('service:universe/registry-service');

        this.service.setApplicationInstance({
            register: (...args) => this.registered.push(args),
            hasRegistration: () => false,
            resolveRegistration: () => undefined,
        });

        this.engine = (resolveResult) => ({
            resolveRegistration: (path) => {
                testContext.resolvedPath = path;
                return resolveResult;
            },
        });
    });

    module('direct registration', function () {
        test('an arrow function is registered without instantiation', async function (assert) {
            const helper = () => 'result';

            await this.service.registerHelper('my-helper', helper);

            assert.strictEqual(this.registered[0][0], 'helper:my-helper');
            assert.strictEqual(this.registered[0][1], helper);
            assert.strictEqual(this.registered[0][2].instantiate, undefined, 'an arrow function has no prototype, so the expression yields undefined');
        });

        test('whether a helper is instantiated depends on how it was WRITTEN', async function (assert) {
            // Pinned, not fixed. The flag is
            //   typeof value !== 'function' || value.prototype
            // which is never a boolean for a function: an arrow function has no
            // prototype and yields undefined (falsy, not instantiated), while an
            // equivalent `function` declaration has one and yields that object
            // (truthy, instantiated as if it were a class). Two helpers with
            // identical behaviour are registered differently based only on their
            // syntax.
            const arrow = () => 'result';
            function declared() {
                return 'result';
            }

            await this.service.registerHelper('arrow-helper', arrow);
            await this.service.registerHelper('declared-helper', declared);

            assert.strictEqual(this.registered[0][2].instantiate, undefined, 'arrow: not instantiated');
            assert.strictEqual(this.registered[1][2].instantiate, declared.prototype, 'declared: instantiated');
        });

        test('a class is registered with instantiation', async function (assert) {
            class MyHelper {}

            await this.service.registerHelper('my-helper', MyHelper);

            assert.strictEqual(this.registered[0][2].instantiate, MyHelper.prototype, 'a prototype is truthy, so it instantiates');
        });

        test('an explicit instantiate option wins', async function (assert) {
            await this.service.registerHelper('my-helper', () => {}, { instantiate: true });

            assert.true(this.registered[0][2].instantiate);
        });

        test('a non-function value is registered for instantiation', async function (assert) {
            await this.service.registerHelper('my-helper', { compute: () => {} });

            assert.true(this.registered[0][2].instantiate);
        });
    });

    module('a TemplateHelper wrapping a class', function () {
        test('it is registered directly, without loading an engine', async function (assert) {
            class MyHelper {}

            await this.service.registerHelper('my-helper', new TemplateHelper('@fleetbase/fleetops-engine', MyHelper));

            assert.deepEqual(this.registered, [['helper:my-helper', MyHelper, { instantiate: true }]]);
            assert.strictEqual(this.requestedEngine, undefined, 'no engine was asked for');
        });

        test('instantiate can be overridden', async function (assert) {
            class MyHelper {}

            await this.service.registerHelper('my-helper', new TemplateHelper('e', MyHelper), { instantiate: false });

            assert.false(this.registered[0][2].instantiate);
        });
    });

    module('a TemplateHelper naming a path in an engine', function () {
        test('the engine is loaded and the helper resolved from it', async function (assert) {
            class MyHelper {}
            this.engineInstance = this.engine(MyHelper);

            await this.service.registerHelper('my-helper', new TemplateHelper('@fleetbase/fleetops-engine', 'helpers/my-helper'));

            assert.strictEqual(this.requestedEngine, '@fleetbase/fleetops-engine');
            assert.strictEqual(this.resolvedPath, 'helper:helpers/my-helper', 'the path is namespaced for the resolver');
            assert.deepEqual(this.registered, [['helper:my-helper', MyHelper, { instantiate: true }]]);
        });

        test('a path already carrying the helper prefix is not doubled', async function (assert) {
            this.engineInstance = this.engine(class {});

            await this.service.registerHelper('my-helper', new TemplateHelper('e', 'helper:already-prefixed'));

            assert.strictEqual(this.resolvedPath, 'helper:already-prefixed');
        });

        test('an engine that will not load registers nothing', async function (assert) {
            this.engineInstance = null;

            await this.service.registerHelper('my-helper', new TemplateHelper('e', 'helpers/my-helper'));

            assert.deepEqual(this.registered, []);
        });

        test('a helper missing from the engine registers nothing', async function (assert) {
            this.engineInstance = this.engine(undefined);

            await this.service.registerHelper('my-helper', new TemplateHelper('e', 'helpers/my-helper'));

            assert.deepEqual(this.registered, []);
        });

        test('a failure while loading is swallowed rather than thrown', async function (assert) {
            this.ensureRejects = true;

            await this.service.registerHelper('my-helper', new TemplateHelper('e', 'helpers/my-helper'));

            assert.deepEqual(this.registered, [], 'and nothing is registered');
        });
    });

    module('instantiate on the engine path', function () {
        test('an explicit instantiate option survives the engine lookup', async function (assert) {
            this.engineInstance = this.engine(class {});

            await this.service.registerHelper('my-helper', new TemplateHelper('@fleetbase/fleetops-engine', 'helpers/my-helper'), { instantiate: false });

            assert.false(this.registered[0][2].instantiate, 'rather than being forced back to true');
        });
    });
});

import { module, test } from 'qunit';
import { setupTest } from 'dummy/tests/helpers';
import {
    RUNTIME_ENGINES_ENDPOINT,
    RUNTIME_ENGINES_NAMESPACE,
    appendConfigMeta,
    createExtensionLoader,
    fetchRuntimeEngines,
    findMissingModules,
    getRejectedRuntimeEngines,
    getRuntimeEngines,
    getRuntimeExtensionLoader,
    hasModule,
    isBuiltInEngine,
    loadScript,
    normalizeRuntimeEngine,
    parseRuntimeManifest,
    prepareRuntimeEngines,
    registerRuntimeEngines,
    resetRuntimeEngines,
    resolveRuntimeUrl,
    runtimeSignature,
    toExtensionEntry,
    wrapRouterMap,
} from '@fleetbase/ember-core/utils/runtime-engines';
import prepareDefault from '@fleetbase/ember-core/utils/runtime-engines';

/**
 * Runtime engines are prebuilt engine releases mounted into a console that was
 * built without them. Everything they touch is a global — loader.js's module
 * registry, document.head, fetch — or an object the caller passes (the
 * application, the router class, the asset loader), so the tests use real
 * loader.js modules and real script elements (blob URLs), and fakes for the
 * rest. Each test removes the modules and meta tags it created.
 */
const ENGINE = '@acme/widgets-engine';

function blobScript(code) {
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}

function routesScript(name = ENGINE) {
    return blobScript(`define(${JSON.stringify(`${name}/routes`)}, ["exports"], function (e) { e.default = function () {}; });`);
}

function rawEngine(overrides = {}) {
    const name = overrides.name ?? ENGINE;
    return {
        name,
        version: '1.2.0',
        baseUrl: `/engines-dist/${name}/`,
        mount: { as: 'widgets', path: 'widgets' },
        bundle: { assets: [{ uri: 'assets/engine.js', type: 'js' }] },
        config: { modulePrefix: ENGINE },
        routes: 'routes.js',
        ...overrides,
    };
}

/**
 * A stand-in for Ember's router DSL that records what is declared. `route`
 * lives on the prototype, as on Ember's DSL, so the wrapper's own-property
 * patch can be observed and its restore checked.
 */
class FakeDsl {
    constructor(prefix = '', log = []) {
        this.prefix = prefix;
        this.log = log;
    }

    route(name, ...rest) {
        const fullName = this.prefix ? `${this.prefix}.${name}` : name;
        this.log.push(`route ${fullName} (${rest.length + 1} args)`);
        const callback = rest.find((arg) => typeof arg === 'function');
        if (callback) {
            callback.call(new FakeDsl(fullName, this.log));
        }
    }

    mount(name, options) {
        const fullName = this.prefix ? `${this.prefix}.${options.as}` : options.as;
        this.log.push(`mount ${name} at ${fullName} (/${options.path})`);
    }
}

function buildMap(Router) {
    const dsl = new FakeDsl();
    Router.dslCallbacks.forEach((callback) => callback.call(dsl));
    return { dsl, log: dsl.log };
}

function consoleRouter() {
    return {
        dslCallbacks: [
            function () {
                this.route('auth', function () {
                    this.route('login');
                });
                this.route('console', { path: '/' }, function () {
                    this.route('home');
                });
                this.route('catch', { path: '/*' });
            },
        ],
    };
}

module('Unit | Utility | runtime-engines', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        resetRuntimeEngines();
        this.definedModules = [];
        this.define = (name, value = {}) => {
            window.define(name, [], () => value);
            this.definedModules.push(name);
        };
        this.originalFetch = window.fetch;
        this.fetched = [];
        this.responses = {};
        window.fetch = (url) => {
            this.fetched.push(String(url));
            const match = Object.keys(this.responses).find((key) => String(url).includes(key));
            if (!match) {
                return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
            }
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(this.responses[match]) });
        };
    });

    hooks.afterEach(function () {
        window.fetch = this.originalFetch;
        for (const name of this.definedModules) {
            delete window.requirejs.entries[name];
        }
        for (const name of [ENGINE, '@acme/other-engine', '@acme/root-engine']) {
            delete window.requirejs.entries[`${name}/routes`];
            delete window.requirejs.entries[`${name}/extension`];
            document.querySelectorAll(`meta[name="${name}/config/environment"]`).forEach((meta) => meta.remove());
        }
        resetRuntimeEngines();
    });

    module('the manifest', function () {
        test('relative paths resolve against the base URL; absolute ones are kept', function (assert) {
            assert.strictEqual(resolveRuntimeUrl('/engines-dist/x/', 'assets/engine.js'), '/engines-dist/x/assets/engine.js');
            assert.strictEqual(resolveRuntimeUrl('/engines-dist/x/', '/elsewhere/engine.js'), '/elsewhere/engine.js');
            assert.strictEqual(resolveRuntimeUrl('/engines-dist/x/', 'https://cdn.example.test/engine.js'), 'https://cdn.example.test/engine.js');
            assert.strictEqual(resolveRuntimeUrl('/engines-dist/x/', 'blob:abc'), 'blob:abc');
        });

        test('a complete entry is normalized with its URLs resolved', function (assert) {
            const engine = normalizeRuntimeEngine(
                rawEngine({
                    baseUrl: 'https://cdn.example.test/widgets',
                    mount: { as: 'widgets', path: 'w', root: true },
                    bundle: { assets: [{ uri: 'assets/engine.js', type: 'js' }], dependencies: ['leaflet'] },
                    hostApp: 'host-app.js',
                    translations: 'translations.json',
                    extension: 'extension.js',
                    manifest: 'manifest.json',
                    requires: ['@fleetbase/ember-ui/components/button'],
                })
            );

            assert.deepEqual(engine, {
                name: ENGINE,
                version: '1.2.0',
                baseUrl: 'https://cdn.example.test/widgets/',
                mount: { as: 'widgets', path: 'w', root: true },
                bundle: { assets: [{ uri: 'https://cdn.example.test/widgets/assets/engine.js', type: 'js' }], dependencies: ['leaflet'] },
                config: { modulePrefix: ENGINE },
                routes: 'https://cdn.example.test/widgets/routes.js',
                hostApp: 'https://cdn.example.test/widgets/host-app.js',
                translations: 'https://cdn.example.test/widgets/translations.json',
                extension: 'https://cdn.example.test/widgets/extension.js',
                manifest: 'https://cdn.example.test/widgets/manifest.json',
                requires: ['@fleetbase/ember-ui/components/button'],
            });
        });

        test('a minimal entry gets the build-time defaults', function (assert) {
            const engine = normalizeRuntimeEngine({ name: ENGINE, bundle: { assets: [{ uri: 'assets/engine.js', type: 'js' }] }, routes: 'routes.js' });

            assert.strictEqual(engine.baseUrl, '/engines-dist/@acme/widgets-engine/', 'served from engines-dist like a built engine');
            assert.deepEqual(engine.mount, { as: 'widgets', path: 'widgets', root: false }, 'mounted where the generator would mount it');
            assert.strictEqual(engine.version, null);
            assert.strictEqual(engine.config, null);
            assert.deepEqual(engine.bundle.dependencies, []);
            assert.strictEqual(engine.hostApp, null);
            assert.strictEqual(engine.translations, null);
            assert.strictEqual(engine.manifest, null);
            assert.strictEqual(engine.requires, null);
            assert.true(engine.extension, 'without a standalone module, the extension comes from the bundle');
        });

        test('an empty path counts as none, and extension:false means no extension', function (assert) {
            const engine = normalizeRuntimeEngine(rawEngine({ hostApp: '', extension: '' }));
            assert.strictEqual(engine.hostApp, null);
            assert.true(engine.extension);

            assert.false(normalizeRuntimeEngine(rawEngine({ extension: false })).extension);
        });

        test('a mount with only a name uses it as the path', function (assert) {
            assert.deepEqual(normalizeRuntimeEngine(rawEngine({ mount: { as: 'gadgets' } })).mount, { as: 'gadgets', path: 'gadgets', root: false });
        });

        test('entries that cannot be mounted are ignored', function (assert) {
            assert.strictEqual(normalizeRuntimeEngine(null), null, 'nothing');
            assert.strictEqual(normalizeRuntimeEngine({ name: '' }), null, 'no name');
            assert.strictEqual(normalizeRuntimeEngine({ name: 42 }), null, 'a name that is not a string');
            assert.strictEqual(normalizeRuntimeEngine(rawEngine({ bundle: undefined })), null, 'no bundle');
            assert.strictEqual(normalizeRuntimeEngine(rawEngine({ bundle: { assets: [] } })), null, 'an empty bundle');
            assert.strictEqual(normalizeRuntimeEngine(rawEngine({ routes: undefined })), null, 'no route map');
        });

        test('the payload may be an object or a bare list; invalid entries and repeats are dropped', function (assert) {
            const entries = [rawEngine(), rawEngine({ version: '9.9.9' }), { name: '' }, rawEngine({ name: '@acme/other-engine' })];

            assert.deepEqual(
                parseRuntimeManifest({ engines: entries }).map((engine) => `${engine.name}@${engine.version}`),
                ['@acme/widgets-engine@1.2.0', '@acme/other-engine@1.2.0'],
                'the first entry of a name wins'
            );
            assert.strictEqual(parseRuntimeManifest(entries).length, 2);
            assert.deepEqual(parseRuntimeManifest(null), []);
            assert.deepEqual(parseRuntimeManifest({}), []);
        });

        test('the signature changes with the set of engines and their versions, not their order', function (assert) {
            const a = { name: 'a', version: '1.0.0' };
            const b = { name: 'b', version: null };

            assert.strictEqual(runtimeSignature([b, a]), 'a@1.0.0,b@');
            assert.strictEqual(runtimeSignature([a, b]), runtimeSignature([b, a]));
            assert.notStrictEqual(runtimeSignature([a]), runtimeSignature([{ ...a, version: '1.0.1' }]));
            assert.strictEqual(runtimeSignature(), '');
        });

        test('an engine becomes an extensions.json-shaped entry', function (assert) {
            const engine = normalizeRuntimeEngine(rawEngine());
            assert.deepEqual(toExtensionEntry(engine), { name: ENGINE, version: '1.2.0', route: 'widgets', fleetbase: { route: 'widgets' }, runtime: true });

            const root = normalizeRuntimeEngine(rawEngine({ mount: { as: 'portal', root: true } }));
            assert.deepEqual(toExtensionEntry(root).fleetbase, { route: 'portal', mount: 'root' });
        });

        test('it is fetched from the registry, falling back to an empty list', async function (assert) {
            this.responses[RUNTIME_ENGINES_ENDPOINT] = { engines: [rawEngine()] };

            const payload = await fetchRuntimeEngines();

            assert.deepEqual(payload, { engines: [rawEngine()] });
            assert.true(this.fetched[0].includes(`${RUNTIME_ENGINES_NAMESPACE}/${RUNTIME_ENGINES_ENDPOINT}`));

            delete this.responses[RUNTIME_ENGINES_ENDPOINT];
            assert.deepEqual(await fetchRuntimeEngines(), { engines: [] }, 'a console without the endpoint boots as before');
        });
    });

    module('the host', function () {
        test('a module is found under its name or its index', function (assert) {
            this.define('@acme/lib/thing');
            this.define('@acme/lib/folder/index');

            assert.true(hasModule('@acme/lib/thing'));
            assert.true(hasModule('@acme/lib/folder'));
            assert.false(hasModule('@acme/lib/nothing'));
        });

        test('missing modules are listed', function (assert) {
            this.define('@acme/lib/thing');

            assert.deepEqual(findMissingModules(['@acme/lib/thing', '@acme/lib/nothing']), ['@acme/lib/nothing']);
            assert.deepEqual(
                findMissingModules(['a', 'b'], (name) => name === 'a'),
                ['b'],
                'the lookup can be supplied'
            );
        });

        test('an engine the console was built with is recognised by its config meta or its route map', function (assert) {
            const doc = document.implementation.createHTMLDocument('');
            assert.false(isBuiltInEngine(ENGINE, doc));

            this.define(`@acme/other-engine/routes`);
            assert.true(isBuiltInEngine('@acme/other-engine', doc), 'by its route map in the host bundle');

            const meta = doc.createElement('meta');
            meta.setAttribute('name', `${ENGINE}/config/environment`);
            doc.head.appendChild(meta);
            assert.true(isBuiltInEngine(ENGINE, doc), 'by its config meta');

            assert.false(isBuiltInEngine('@acme/absent-engine'), 'the live document by default');
        });

        test('the config meta is escaped the way the engine reads it', function (assert) {
            const engine = normalizeRuntimeEngine(rawEngine({ config: { modulePrefix: ENGINE, greeting: 'héllo wörld' } }));

            appendConfigMeta(engine);

            const meta = document.querySelector(`meta[name="${ENGINE}/config/environment"]`);
            assert.deepEqual(JSON.parse(unescape(meta.getAttribute('content'))), engine.config);
        });

        test('an existing meta tag is left alone, and no config means no tag', function (assert) {
            const doc = document.implementation.createHTMLDocument('');
            appendConfigMeta(normalizeRuntimeEngine(rawEngine()), doc);
            appendConfigMeta(normalizeRuntimeEngine(rawEngine({ config: { other: true } })), doc);

            const metas = doc.querySelectorAll(`meta[name="${ENGINE}/config/environment"]`);
            assert.strictEqual(metas.length, 1);
            assert.deepEqual(JSON.parse(unescape(metas[0].getAttribute('content'))), { modulePrefix: ENGINE }, 'the first one stays');

            appendConfigMeta(normalizeRuntimeEngine(rawEngine({ name: '@acme/other-engine', config: undefined })), doc);
            assert.strictEqual(doc.querySelectorAll('meta[name="@acme/other-engine/config/environment"]').length, 0);
        });

        test('scripts load through script elements', async function (assert) {
            await loadScript(blobScript('window.__runtimeEnginesTestLoaded = 1;'));
            assert.strictEqual(window.__runtimeEnginesTestLoaded, 1);
            delete window.__runtimeEnginesTestLoaded;

            const url = blobScript('');
            URL.revokeObjectURL(url);
            await assert.rejects(loadScript(url), /Could not load/, 'a failed load rejects');
        });
    });

    module('the router map', function () {
        test('console mounts go inside the generated console route; the other routes are untouched', function (assert) {
            const Router = consoleRouter();
            const engines = [normalizeRuntimeEngine(rawEngine())];

            assert.true(wrapRouterMap(Router, engines));
            const { dsl, log } = buildMap(Router);

            assert.deepEqual(log, [
                'route auth (2 args)',
                'route auth.login (1 args)',
                'route console (3 args)',
                'route console.home (1 args)',
                'mount @acme/widgets-engine at console.widgets (/widgets)',
                'route catch (2 args)',
            ]);
            assert.strictEqual(dsl.route, FakeDsl.prototype.route, 'the DSL is restored');
        });

        test('root mounts go before the catch-all route', function (assert) {
            const Router = consoleRouter();
            wrapRouterMap(Router, [normalizeRuntimeEngine(rawEngine({ name: '@acme/root-engine', mount: { as: 'portal', root: true } }))]);

            const { log } = buildMap(Router);

            assert.deepEqual(log.slice(-2), ['mount @acme/root-engine at portal (/portal)', 'route catch (2 args)']);
            assert.strictEqual(log.filter((line) => line.startsWith('mount')).length, 1, 'mounted once');
        });

        test('without a catch-all, root mounts go at the end', function (assert) {
            const Router = {
                dslCallbacks: [
                    function () {
                        this.route('console', function () {});
                    },
                ],
            };
            wrapRouterMap(Router, [normalizeRuntimeEngine(rawEngine({ name: '@acme/root-engine', mount: { as: 'portal', root: true } }))]);

            const { log } = buildMap(Router);

            assert.deepEqual(log, ['route console (2 args)', 'mount @acme/root-engine at portal (/portal)']);
        });

        test('a map without a console route mounts no console engines', function (assert) {
            const Router = {
                dslCallbacks: [
                    function () {
                        this.route('console');
                        this.route('about', function () {});
                    },
                ],
            };
            wrapRouterMap(Router, [normalizeRuntimeEngine(rawEngine())]);

            const { log } = buildMap(Router);

            assert.deepEqual(log, ['route console (1 args)', 'route about (2 args)'], 'a console route without children is not a mount point');
        });

        test('a second console route in the same map is not mounted into again', function (assert) {
            const Router = {
                dslCallbacks: [
                    function () {
                        this.route('console', function () {});
                        this.route('console', function () {});
                    },
                ],
            };
            wrapRouterMap(Router, [normalizeRuntimeEngine(rawEngine())]);

            const { log } = buildMap(Router);

            assert.strictEqual(log.filter((line) => line.startsWith('mount')).length, 1);
        });

        test('each build of the map gets the mounts once', function (assert) {
            const Router = consoleRouter();
            wrapRouterMap(Router, [normalizeRuntimeEngine(rawEngine())]);

            assert.strictEqual(buildMap(Router).log.filter((line) => line.startsWith('mount')).length, 1);
            assert.strictEqual(buildMap(Router).log.filter((line) => line.startsWith('mount')).length, 1, 'a second router instance');
        });

        test('nothing is wrapped twice, without engines, or without a map', function (assert) {
            const Router = consoleRouter();
            const engines = [normalizeRuntimeEngine(rawEngine())];

            assert.false(wrapRouterMap(Router, []), 'no engines');
            assert.true(wrapRouterMap(Router, engines));
            assert.false(wrapRouterMap(Router, engines), 'already wrapped');
            assert.false(wrapRouterMap(undefined, engines), 'no router');
            assert.false(wrapRouterMap({}, engines), 'no map');
            assert.false(wrapRouterMap({ dslCallbacks: [] }, engines), 'an empty map');
        });

        test('the DSL is restored even when the map throws', function (assert) {
            const Router = {
                dslCallbacks: [
                    function () {
                        throw new Error('bad map');
                    },
                ],
            };
            wrapRouterMap(Router, [normalizeRuntimeEngine(rawEngine())]);
            const dsl = new FakeDsl();

            assert.throws(() => Router.dslCallbacks[0].call(dsl), /bad map/);
            assert.strictEqual(dsl.route, FakeDsl.prototype.route);
        });
    });

    module('before boot', function (hooks) {
        hooks.beforeEach(function () {
            this.Router = consoleRouter();
            this.application = { resolveRegistration: (name) => (name === 'router:main' ? this.Router : undefined) };
            this.doc = document.implementation.createHTMLDocument('');
            this.loaded = [];
            this.load = (url) => {
                this.loaded.push(url);
                if (url.includes('broken')) {
                    return Promise.reject(new Error('404'));
                }
                if (url.endsWith('/routes.js')) {
                    const name = url.split('/engines-dist/')[1].replace('/routes.js', '');
                    window.define(`${name}/routes`, [], () => ({}));
                }
                return Promise.resolve();
            };
            this.errors = [];
            this.originalError = console.error;
            console.error = (...args) => this.errors.push(args);
        });

        hooks.afterEach(function () {
            console.error = this.originalError;
        });

        test('an accepted engine gets its config meta, scripts, translations and mount', async function (assert) {
            this.responses['translations.json'] = [['en-us', { widgets: { title: 'Widgets' } }]];
            const payload = { engines: [rawEngine({ hostApp: 'host-app.js', translations: 'translations.json', requires: [] })] };

            const accepted = await prepareRuntimeEngines(this.application, { payload, doc: this.doc, load: this.load });

            assert.deepEqual(
                accepted.map((engine) => engine.name),
                [ENGINE]
            );
            assert.strictEqual(getRuntimeEngines(), accepted);
            assert.deepEqual(getRejectedRuntimeEngines(), []);
            assert.deepEqual(this.loaded, ['/engines-dist/@acme/widgets-engine/routes.js', '/engines-dist/@acme/widgets-engine/host-app.js']);
            assert.ok(this.doc.querySelector(`meta[name="${ENGINE}/config/environment"]`), 'config meta appended');
            assert.deepEqual(accepted[0].messages, [['en-us', { widgets: { title: 'Widgets' } }]]);
            assert.true(
                buildMap(this.Router).log.includes('mount @acme/widgets-engine at console.widgets (/widgets)'),
                'mounted'
            );
        });

        test('an engine without host modules or translations still loads', async function (assert) {
            const accepted = await prepareRuntimeEngines(this.application, { payload: [rawEngine()], doc: this.doc, load: this.load });

            assert.deepEqual(this.loaded, ['/engines-dist/@acme/widgets-engine/routes.js']);
            assert.deepEqual(accepted[0].messages, []);
        });

        test('an engine the console was built with keeps its build', async function (assert) {
            this.define(`${ENGINE}/routes`);

            const accepted = await prepareRuntimeEngines(this.application, { payload: [rawEngine()], doc: this.doc, load: this.load });

            assert.deepEqual(accepted, []);
            assert.deepEqual(this.loaded, [], 'nothing of the release is loaded');
            assert.deepEqual(getRejectedRuntimeEngines(), [], 'and it is not a refusal');
        });

        test('an engine that needs modules the console lacks is refused', async function (assert) {
            this.define('@acme/lib/present');
            const payload = [rawEngine({ requires: ['@acme/lib/present', '@acme/lib/absent'] })];

            const accepted = await prepareRuntimeEngines(this.application, { payload, doc: this.doc, load: this.load });

            assert.deepEqual(accepted, []);
            assert.deepEqual(getRejectedRuntimeEngines(), [{ name: ENGINE, version: '1.2.0', reason: 'missing-modules', missing: ['@acme/lib/absent'] }]);
            assert.deepEqual(this.loaded, [], 'nothing of it is loaded');
            assert.false(Boolean(this.doc.querySelector('meta')), 'not even its config');
            assert.deepEqual(this.errors[0][1], ['@acme/lib/absent'], 'the missing modules are logged');
            assert.strictEqual(buildMap(this.Router).log.filter((line) => line.startsWith('mount')).length, 0, 'and it is not mounted');
        });

        test("the required modules come from the release's manifest.json when not inlined", async function (assert) {
            this.responses['manifest.json'] = { requires: { modules: ['@acme/lib/absent'] } };
            const payload = [rawEngine({ manifest: 'manifest.json' }), rawEngine({ name: '@acme/other-engine', manifest: 'other.json' })];
            this.responses['other.json'] = {};

            const accepted = await prepareRuntimeEngines(this.application, { payload, doc: this.doc, load: this.load, has: () => false });

            assert.deepEqual(
                accepted.map((engine) => engine.name),
                ['@acme/other-engine'],
                'a manifest without requirements passes'
            );
            assert.strictEqual(getRejectedRuntimeEngines()[0].reason, 'missing-modules');
        });

        test('an engine whose manifest cannot be read is refused', async function (assert) {
            const accepted = await prepareRuntimeEngines(this.application, { payload: [rawEngine({ manifest: 'gone.json' })], doc: this.doc, load: this.load });

            assert.deepEqual(accepted, []);
            assert.strictEqual(getRejectedRuntimeEngines()[0].reason, 'manifest-unavailable');
            assert.true(/gone\.json/.test(this.errors[0][1]), 'the error is logged');
        });

        test('an engine whose files fail to load is refused', async function (assert) {
            const payload = [rawEngine({ baseUrl: '/engines-dist/broken/' })];

            const accepted = await prepareRuntimeEngines(this.application, { payload, doc: this.doc, load: this.load });

            assert.deepEqual(accepted, []);
            assert.deepEqual(getRejectedRuntimeEngines()[0].reason, 'load-failed');
        });

        test('a routes file that does not define the route map is a load failure', async function (assert) {
            const payload = [rawEngine()];

            await prepareRuntimeEngines(this.application, { payload, doc: this.doc, load: () => Promise.resolve() });

            assert.true(/did not define @acme\/widgets-engine\/routes/.test(getRejectedRuntimeEngines()[0].error));
        });

        test('with no options it fetches the manifest and loads real scripts', async function (assert) {
            this.responses[RUNTIME_ENGINES_ENDPOINT] = { engines: [rawEngine({ routes: routesScript() })] };

            const accepted = await prepareDefault(this.application);

            assert.deepEqual(
                accepted.map((engine) => engine.name),
                [ENGINE]
            );
            assert.ok(document.querySelector(`meta[name="${ENGINE}/config/environment"]`), 'on the live document');
        });
    });

    module('at instance boot', function (hooks) {
        hooks.beforeEach(function () {
            this.pushed = [];
            this.bundlesLoaded = [];
            this.translations = [];
            this.assetLoader = {
                pushManifest: (manifest) => this.pushed.push(manifest),
                loadBundle: (name) => {
                    this.bundlesLoaded.push(name);
                    window.define(`${name}/extension`, ['exports'], (exports) => {
                        exports.default = { from: 'bundle' };
                    });
                    return Promise.resolve();
                },
            };
            this.intl = { addTranslations: (locale, messages) => this.translations.push([locale, messages]) };
            this.appInstance = {
                lookup: (name) => ({ 'service:asset-loader': this.assetLoader, 'service:intl': this.intl })[name],
            };
            const load = (url) => {
                if (url.endsWith('/routes.js')) {
                    window.define(`${ENGINE}/routes`, [], () => ({}));
                }
                return Promise.resolve();
            };
            const application = { resolveRegistration: () => consoleRouter() };
            this.prepare = (payload) => prepareRuntimeEngines(application, { payload, doc: document.implementation.createHTMLDocument(''), load, has: () => true });
        });

        test('bundles, translations and extension loaders are registered', async function (assert) {
            const [engine] = await this.prepare([rawEngine()]);
            engine.messages = [['en-us', { a: 'A' }]];

            const registered = registerRuntimeEngines(this.appInstance);

            assert.deepEqual(registered, [engine]);
            assert.deepEqual(this.pushed, [{ bundles: { [ENGINE]: engine.bundle } }]);
            assert.deepEqual(this.translations, [['en-us', { a: 'A' }]]);
            assert.strictEqual(typeof getRuntimeExtensionLoader(ENGINE), 'function');
        });

        test('nothing happens without runtime engines', function (assert) {
            assert.deepEqual(registerRuntimeEngines(this.appInstance), []);
            assert.deepEqual(this.pushed, []);
        });

        test('an engine without an extension or translations gets no loader', async function (assert) {
            const [engine] = await this.prepare([rawEngine({ extension: false })]);
            engine.messages = undefined;

            registerRuntimeEngines(this.appInstance);

            assert.strictEqual(getRuntimeExtensionLoader(ENGINE), undefined);
            assert.deepEqual(this.pushed.length, 1, 'its bundle is still registered');
        });

        test('a console without ember-intl skips the translations', async function (assert) {
            const [engine] = await this.prepare([rawEngine()]);
            engine.messages = [['en-us', { a: 'A' }]];
            this.intl = undefined;

            registerRuntimeEngines(this.appInstance);

            assert.deepEqual(this.translations, []);
            assert.strictEqual(typeof getRuntimeExtensionLoader(ENGINE), 'function');
        });

        test('the extension loader without a standalone module loads the bundle first', async function (assert) {
            const [engine] = await this.prepare([rawEngine()]);

            const extension = await createExtensionLoader(engine, this.assetLoader)();

            assert.deepEqual(this.bundlesLoaded, [ENGINE]);
            assert.deepEqual(extension.default, { from: 'bundle' });
        });

        test('the extension loader with a standalone module leaves the bundle alone', async function (assert) {
            const url = blobScript(`define("${ENGINE}/extension", ["exports"], function (e) { e.default = { from: 'standalone' }; });`);
            const [engine] = await this.prepare([rawEngine({ extension: url })]);

            const extension = await createExtensionLoader(engine, this.assetLoader)();

            assert.deepEqual(this.bundlesLoaded, [], 'the engine stays lazy');
            assert.deepEqual(extension.default, { from: 'standalone' });
        });
    });
});

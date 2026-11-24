import { debug, warn } from '@ember/debug';
import fleetbaseApiFetch from './fleetbase-api-fetch';
import { getExtensionMountPath } from './map-engines';

/**
 * Runtime engines: prebuilt engine releases mounted into a console that was
 * built without them.
 *
 * A console build does seven things for every engine it compiles in (see
 * docs/runtime-engines.md). A prebuilt release ships the output of those steps
 * as files, and this module replays them at boot:
 *
 *   before the app boots   prepareRuntimeEngines(application)
 *     1. fetch the runtime manifest (GET ~registry/v1/engines/runtime)
 *     2. drop engines the host already has, and engines whose release needs a
 *        module the host does not define
 *     3. append each engine's `<name>/config/environment` meta tag
 *     4. evaluate routes.js (`<name>/routes`) and host-app.js (the engine's
 *        `app/` re-exports into `@fleetbase/console/*`)
 *     5. fetch translations.json
 *     6. wrap the generated router map so the mounts land inside it
 *
 *   instance boot          registerRuntimeEngines(appInstance)
 *     7. push each bundle into the asset loader's manifest
 *     8. add the translations to ember-intl
 *     9. register an extension loader per engine, which the extension manager
 *        falls back to when the build-time map has none
 *
 * Runtime manifest, as served by the API (paths are relative to `baseUrl`
 * unless absolute):
 *
 *     {
 *       "engines": [{
 *         "name": "@fleetbase/pallet-engine",
 *         "version": "0.0.2",
 *         "baseUrl": "/engines-dist/@fleetbase/pallet-engine/",
 *         "mount": { "as": "pallet", "path": "pallet", "root": false },
 *         "bundle": { "assets": [{ "uri": "assets/engine.js", "type": "js" }], "dependencies": [] },
 *         "config": { "modulePrefix": "@fleetbase/pallet-engine", ... },
 *         "routes": "routes.js",
 *         "hostApp": "host-app.js",
 *         "translations": "translations.json",
 *         "extension": "extension.js",
 *         "manifest": "manifest.json",
 *         "requires": ["@fleetbase/ember-ui/components/layout/resource/action-buttons", ...]
 *       }]
 *     }
 *
 * `extension` is the URL of the standalone `<name>/extension` module, `true`
 * to load the whole bundle and require it from there, or `false` when the
 * engine has none. `requires` is optional; without it the module list is read
 * from the release's `manifest.json` (`requires.modules`), and with neither
 * the compatibility check is skipped.
 */

export const RUNTIME_ENGINES_NAMESPACE = '~registry/v1';
export const RUNTIME_ENGINES_ENDPOINT = 'engines/runtime';

const state = {
    engines: [],
    rejected: [],
    loaders: new Map(),
};

const wrappedRouters = new WeakSet();

/**
 * The runtime engines accepted by the last `prepareRuntimeEngines` call.
 *
 * @return {Array<Object>}
 */
export function getRuntimeEngines() {
    return state.engines;
}

/**
 * The engines the last `prepareRuntimeEngines` call refused, with the reason
 * (`missing-modules`, `manifest-unavailable` or `load-failed`).
 *
 * @return {Array<Object>}
 */
export function getRejectedRuntimeEngines() {
    return state.rejected;
}

/**
 * The extension loader registered for a runtime engine, if any.
 *
 * @param {String} name
 * @return {Function|undefined}
 */
export function getRuntimeExtensionLoader(name) {
    return state.loaders.get(name);
}

/**
 * Forget every runtime engine. For tests.
 */
export function resetRuntimeEngines() {
    state.engines = [];
    state.rejected = [];
    state.loaders = new Map();
}

/**
 * Resolve a release path against the engine's base URL. Absolute paths and
 * URLs are kept as they are.
 *
 * @param {String} baseUrl
 * @param {String} path
 * @return {String}
 */
export function resolveRuntimeUrl(baseUrl, path) {
    if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(path)) {
        return path;
    }

    return `${baseUrl}${path}`;
}

function optionalUrl(baseUrl, path) {
    return typeof path === 'string' && path.length > 0 ? resolveRuntimeUrl(baseUrl, path) : null;
}

function extensionSource(baseUrl, extension) {
    if (extension === false) {
        return false;
    }

    return optionalUrl(baseUrl, extension) ?? true;
}

/**
 * Validate one runtime manifest entry and resolve its URLs. Returns null for an
 * entry that cannot be mounted (no name, no bundle assets or no route map).
 *
 * @param {Object} raw
 * @return {Object|null}
 */
export function normalizeRuntimeEngine(raw) {
    const name = raw?.name;
    if (typeof name !== 'string' || name.length === 0) {
        warn('[runtime-engines] Ignoring a runtime engine without a name.', false, { id: 'ember-core.runtime-engines.invalid-entry' });
        return null;
    }

    const assets = raw.bundle?.assets;
    if (!Array.isArray(assets) || assets.length === 0 || typeof raw.routes !== 'string') {
        warn(`[runtime-engines] Ignoring ${name}: a runtime engine needs bundle assets and a routes module.`, false, { id: 'ember-core.runtime-engines.invalid-entry' });
        return null;
    }

    const baseUrl = (raw.baseUrl ?? `/engines-dist/${name}/`).replace(/\/?$/, '/');
    const as = raw.mount?.as ?? getExtensionMountPath(name);

    return {
        name,
        version: raw.version ?? null,
        baseUrl,
        mount: { as, path: raw.mount?.path ?? as, root: raw.mount?.root === true },
        bundle: {
            assets: assets.map((asset) => ({ ...asset, uri: resolveRuntimeUrl(baseUrl, asset.uri) })),
            dependencies: raw.bundle.dependencies ?? [],
        },
        config: raw.config ?? null,
        routes: resolveRuntimeUrl(baseUrl, raw.routes),
        hostApp: optionalUrl(baseUrl, raw.hostApp),
        translations: optionalUrl(baseUrl, raw.translations),
        extension: extensionSource(baseUrl, raw.extension),
        manifest: optionalUrl(baseUrl, raw.manifest),
        requires: Array.isArray(raw.requires) ? raw.requires : null,
    };
}

/**
 * Normalize a runtime manifest payload (`{ engines: [...] }` or a bare array)
 * into engine entries, dropping invalid entries and duplicate names.
 *
 * @param {Object|Array} payload
 * @return {Array<Object>}
 */
export function parseRuntimeManifest(payload) {
    const entries = Array.isArray(payload) ? payload : (payload?.engines ?? []);
    const seen = new Set();
    const engines = [];

    for (const entry of entries) {
        const engine = normalizeRuntimeEngine(entry);
        if (engine && !seen.has(engine.name)) {
            seen.add(engine.name);
            engines.push(engine);
        }
    }

    return engines;
}

/**
 * A stable signature of a runtime engine list: changes whenever an engine is
 * added, removed or moved to another version.
 *
 * @param {Array<Object>} engines
 * @return {String}
 */
export function runtimeSignature(engines = []) {
    return engines
        .map((engine) => `${engine.name}@${engine.version ?? ''}`)
        .sort()
        .join(',');
}

/**
 * The entry a runtime engine contributes to the installed extensions list, in
 * the shape of a build-time `extensions.json` entry.
 *
 * @param {Object} engine
 * @return {Object}
 */
export function toExtensionEntry(engine) {
    const fleetbase = { route: engine.mount.as };
    if (engine.mount.root) {
        fleetbase.mount = 'root';
    }

    return { name: engine.name, version: engine.version, route: engine.mount.as, fleetbase, runtime: true };
}

/**
 * Whether loader.js has a module, following its `<name>/index` fallback.
 *
 * @param {String} name
 * @return {Boolean}
 */
export function hasModule(name) {
    const entries = window.requirejs.entries;
    return name in entries || `${name}/index` in entries;
}

/**
 * The modules in `required` that the running host does not define.
 *
 * @param {Array<String>} required
 * @param {Function} has
 * @return {Array<String>}
 */
export function findMissingModules(required, has = hasModule) {
    return required.filter((name) => !has(name));
}

/**
 * Whether the host was built with this engine, in which case its own build
 * wins over the runtime release.
 *
 * @param {String} name
 * @param {Document} doc
 * @return {Boolean}
 */
export function isBuiltInEngine(name, doc = document) {
    return doc.querySelector(`meta[name="${name}/config/environment"]`) !== null || hasModule(`${name}/routes`);
}

/**
 * Append the engine's config meta tag, which its `config/environment` module
 * reads (with `unescape`) the first time the bundle is required.
 *
 * @param {Object} engine
 * @param {Document} doc
 */
export function appendConfigMeta(engine, doc = document) {
    const metaName = `${engine.name}/config/environment`;
    if (!engine.config || doc.querySelector(`meta[name="${metaName}"]`)) {
        return;
    }

    const meta = doc.createElement('meta');
    meta.setAttribute('name', metaName);
    meta.setAttribute('content', escape(JSON.stringify(engine.config)));
    doc.head.appendChild(meta);
}

/**
 * Load a classic script. Script elements rather than eval so a strict
 * `script-src` CSP keeps working.
 *
 * @param {String} url
 * @param {Document} doc
 * @return {Promise<void>}
 */
export function loadScript(url, doc = document) {
    return new Promise((resolve, reject) => {
        const script = doc.createElement('script');
        script.src = url;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Could not load ${url}`));
        doc.head.appendChild(script);
    });
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'default' });
    if (!response.ok) {
        throw new Error(`Could not load ${url} (${response.status})`);
    }

    return response.json();
}

/**
 * Fetch the runtime manifest from the registry. Resolves to an empty list when
 * the endpoint is missing or fails, so a console without the registry boots as
 * before.
 *
 * @return {Promise<Object|Array>}
 */
export function fetchRuntimeEngines() {
    return fleetbaseApiFetch('GET', RUNTIME_ENGINES_ENDPOINT, {}, { namespace: RUNTIME_ENGINES_NAMESPACE, fallbackResponse: { engines: [] } });
}

async function requiredModulesFor(engine) {
    if (engine.requires) {
        return engine.requires;
    }

    if (!engine.manifest) {
        return [];
    }

    const manifest = await fetchJson(engine.manifest);
    return manifest?.requires?.modules ?? [];
}

async function checkCompatibility(engine, has) {
    let required;
    try {
        required = await requiredModulesFor(engine);
    } catch (error) {
        return { name: engine.name, version: engine.version, reason: 'manifest-unavailable', error: error.message };
    }

    const missing = findMissingModules(required, has);
    if (missing.length > 0) {
        return { name: engine.name, version: engine.version, reason: 'missing-modules', missing };
    }

    return null;
}

async function loadEngineFiles(engine, doc, load) {
    appendConfigMeta(engine, doc);

    const [, , messages] = await Promise.all([load(engine.routes, doc), engine.hostApp ? load(engine.hostApp, doc) : null, engine.translations ? fetchJson(engine.translations) : []]);

    if (!hasModule(`${engine.name}/routes`)) {
        throw new Error(`${engine.routes} did not define ${engine.name}/routes`);
    }

    engine.messages = messages;
}

/**
 * Append the runtime engines' mounts to the generated router map.
 *
 * The generated map is wrapped rather than extended with a second
 * `Router.map()`: a second callback that declares `console` again replaces
 * the first one's children. Console mounts are added at the end of the
 * existing `console` route's callback; root mounts (`mount.root`) go in front
 * of the `catch` route, or at the end of the map when there is none.
 *
 * @param {Class} Router The application's router class
 * @param {Array<Object>} engines
 * @return {Boolean} whether the map was wrapped
 */
export function wrapRouterMap(Router, engines) {
    if (engines.length === 0 || wrappedRouters.has(Router)) {
        return false;
    }

    const callbacks = Router?.dslCallbacks;
    if (!Array.isArray(callbacks) || callbacks.length === 0) {
        warn('[runtime-engines] The router has no map to mount runtime engines into.', false, { id: 'ember-core.runtime-engines.no-router-map' });
        return false;
    }

    const consoleMounts = engines.filter((engine) => !engine.mount.root);
    const rootMounts = engines.filter((engine) => engine.mount.root);
    const mountedConsole = new WeakSet();
    const mountedRoot = new WeakSet();
    const mountAll = (dsl, list) => list.forEach((engine) => dsl.mount(engine.name, { as: engine.mount.as, path: engine.mount.path }));
    const mountRoot = (dsl) => {
        if (!mountedRoot.has(dsl)) {
            mountedRoot.add(dsl);
            mountAll(dsl, rootMounts);
        }
    };

    const wrap = (original) =>
        function runtimeEnginesRouterMap() {
            const dsl = this;
            const route = dsl.route;

            dsl.route = function (name, ...rest) {
                if (name === 'catch') {
                    mountRoot(dsl);
                }

                const callbackIndex = rest.length - 1;
                if (name === 'console' && typeof rest[callbackIndex] === 'function' && !mountedConsole.has(dsl)) {
                    mountedConsole.add(dsl);
                    const inner = rest[callbackIndex];
                    rest[callbackIndex] = function () {
                        inner.call(this);
                        mountAll(this, consoleMounts);
                    };
                }

                return route.call(dsl, name, ...rest);
            };

            try {
                original.call(dsl);
            } finally {
                dsl.route = route;
            }
        };

    for (let i = 0; i < callbacks.length; i++) {
        callbacks[i] = wrap(callbacks[i]);
    }

    callbacks.push(function () {
        mountRoot(this);
        if (consoleMounts.length > 0 && !mountedConsole.has(this)) {
            warn(`[runtime-engines] The router map has no console route; not mounting ${consoleMounts.map((engine) => engine.name).join(', ')}.`, false, {
                id: 'ember-core.runtime-engines.no-console-route',
            });
        }
    });

    wrappedRouters.add(Router);
    return true;
}

/**
 * Before boot: fetch the runtime manifest, check and load each engine's files,
 * and mount the accepted engines into the router map. Call from an
 * initializer that defers readiness until this settles, after the runtime
 * config (API host) is applied.
 *
 * @param {Application} application
 * @param {Object} [options]
 * @param {Object|Array} [options.payload] use this manifest instead of fetching it
 * @param {Document} [options.doc]
 * @param {Function} [options.has] module lookup used by the compatibility check
 * @param {Function} [options.load] script loader
 * @return {Promise<Array<Object>>} the accepted engines
 */
export async function prepareRuntimeEngines(application, { payload, doc = document, has = hasModule, load = loadScript } = {}) {
    const candidates = parseRuntimeManifest(payload ?? (await fetchRuntimeEngines())).filter((engine) => {
        if (isBuiltInEngine(engine.name, doc)) {
            debug(`[runtime-engines] ${engine.name} is built into this console; ignoring its runtime release.`);
            return false;
        }

        return true;
    });

    const rejected = [];
    const verdicts = await Promise.all(candidates.map((engine) => checkCompatibility(engine, has)));
    const compatible = candidates.filter((engine, index) => {
        if (verdicts[index]) {
            rejected.push(verdicts[index]);
            return false;
        }

        return true;
    });

    const loaded = await Promise.all(
        compatible.map((engine) =>
            loadEngineFiles(engine, doc, load).then(
                () => engine,
                (error) => {
                    rejected.push({ name: engine.name, version: engine.version, reason: 'load-failed', error: error.message });
                    return null;
                }
            )
        )
    );
    const accepted = loaded.filter(Boolean);

    for (const refusal of rejected) {
        console.error(`[runtime-engines] Not mounting ${refusal.name}@${refusal.version} (${refusal.reason}):`, refusal.missing ?? refusal.error);
    }

    wrapRouterMap(application.resolveRegistration('router:main'), accepted);

    state.engines = accepted;
    state.rejected = rejected;
    state.loaders = new Map();

    debug(`[runtime-engines] Prepared ${accepted.length} runtime engine(s), refused ${rejected.length}.`);
    return accepted;
}

/**
 * The loader the extension manager runs for a runtime engine: load the
 * standalone `<name>/extension` module when the release ships one (keeps the
 * engine bundle lazy), otherwise load the whole bundle, then require it.
 *
 * @param {Object} engine
 * @param {Service} assetLoader
 * @param {Function} load script loader
 * @return {Function}
 */
export function createExtensionLoader(engine, assetLoader, load = loadScript) {
    return () => {
        const ready = typeof engine.extension === 'string' ? load(engine.extension) : assetLoader.loadBundle(engine.name);
        return ready.then(() => window.require(`${engine.name}/extension`));
    };
}

/**
 * At instance boot, after the asset manifest is loaded and before extensions
 * are set up: register the prepared engines' bundles, translations and
 * extension loaders.
 *
 * @param {ApplicationInstance} appInstance
 * @return {Array<Object>} the registered engines
 */
export function registerRuntimeEngines(appInstance) {
    const engines = state.engines;
    if (engines.length === 0) {
        return engines;
    }

    const assetLoader = appInstance.lookup('service:asset-loader');
    const intl = appInstance.lookup('service:intl');
    const bundles = {};

    for (const engine of engines) {
        bundles[engine.name] = engine.bundle;
    }

    assetLoader.pushManifest({ bundles });

    for (const engine of engines) {
        for (const [locale, messages] of engine.messages ?? []) {
            intl?.addTranslations(locale, messages);
        }

        if (engine.extension) {
            state.loaders.set(engine.name, createExtensionLoader(engine, assetLoader));
        }
    }

    return engines;
}

export default prepareRuntimeEngines;

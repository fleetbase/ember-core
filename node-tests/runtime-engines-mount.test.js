'use strict';

/**
 * End to end: a prebuilt engine release mounts into a console that was built
 * without it.
 *
 * Needs two build outputs, so it only runs when pointed at them:
 *
 *   RUNTIME_ENGINES_HOST_DIST   a console dist built WITHOUT the engine
 *   RUNTIME_ENGINES_RELEASE     <out>/<name> written by bin/build-engine-release.js
 *                               from a console build WITH it (same ember-ui/ember-core)
 *   RUNTIME_ENGINES_CONSOLE     optional: a console checkout with node_modules. When set,
 *                               this checkout's runtime-engine sources are transpiled and
 *                               injected, for a host dist built with an older ember-core.
 *   CHROME_PATH                 optional: Chrome or Chromium binary
 *
 *   node --test node-tests/runtime-engines-mount.test.js
 *
 * The page boots signed out against a stub API (only the runtime manifest and
 * fleetbase.config.json are served; every other API call is a 404), which is
 * enough to prove the mount: route map, host modules, asset manifest, config
 * meta, translations, extension setup and loading the engine itself.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findChrome, serveConsole, launchChrome, buildSourceOverlay } = require('./helpers/runtime-console');

const HOST_DIST = process.env.RUNTIME_ENGINES_HOST_DIST;
const RELEASE = process.env.RUNTIME_ENGINES_RELEASE;
const CONSOLE = process.env.RUNTIME_ENGINES_CONSOLE;
const CHROME = findChrome();
const EMBER_CORE = path.join(__dirname, '..');

const skip =
    (!HOST_DIST || !RELEASE ? 'set RUNTIME_ENGINES_HOST_DIST and RUNTIME_ENGINES_RELEASE to run' : null) ??
    (typeof WebSocket === 'undefined' ? 'needs Node 22+ (global WebSocket)' : null) ??
    (!CHROME ? 'no Chrome found (set CHROME_PATH)' : null);

function overlay() {
    if (!CONSOLE) {
        return undefined;
    }

    const consoleApp = path.join(EMBER_CORE, '..', '..', 'console', 'app');
    return buildSourceOverlay(CONSOLE, {
        '@fleetbase/ember-core/utils/runtime-engines': path.join(EMBER_CORE, 'addon/utils/runtime-engines.js'),
        '@fleetbase/ember-core/utils/load-extensions': path.join(EMBER_CORE, 'addon/utils/load-extensions.js'),
        '@fleetbase/ember-core/utils/load-installed-extensions': path.join(EMBER_CORE, 'addon/utils/load-installed-extensions.js'),
        '@fleetbase/ember-core/services/universe/extension-manager': path.join(EMBER_CORE, 'addon/services/universe/extension-manager.js'),
        '@fleetbase/console/initializers/load-runtime-config': path.join(consoleApp, 'initializers/load-runtime-config.js'),
        '@fleetbase/console/initializers/load-runtime-engines': path.join(consoleApp, 'initializers/load-runtime-engines.js'),
        '@fleetbase/console/instance-initializers/register-runtime-engines': path.join(consoleApp, 'instance-initializers/register-runtime-engines.js'),
    });
}

/**
 * Read the booted app from the page. Resolves `ready` once the extension
 * manager has set up every extension, including the runtime one.
 */
const probe = (name) => `(() => {
    const Namespace = require('@ember/application/namespace').default;
    const app = Namespace.NAMESPACES.find((ns) => ns._applicationInstances && ns._applicationInstances.size);
    if (!app) return { ready: false, stage: 'app' };
    const instance = [...app._applicationInstances][0];
    const router = instance.lookup('router:main');
    const recognizer = router._routerMicrolib && router._routerMicrolib.recognizer;
    if (!recognizer) return { ready: false, stage: 'router' };
    const runtime = require('@fleetbase/ember-core/utils/runtime-engines');
    const extensions = instance.lookup('service:universe/extension-manager');
    const extensionModule = window.requirejs.entries[${JSON.stringify(`${name}/extension`)}];
    const settled = runtime.getRejectedRuntimeEngines().some((r) => r.name === ${JSON.stringify(name)}) || (extensionModule && extensionModule.state !== 'new');
    if (!settled) return { ready: false, stage: 'extensions' };
    return { ready: true };
})()`;

const inspect = (name, mount, translationKey) => `(async () => {
    const Namespace = require('@ember/application/namespace').default;
    const app = Namespace.NAMESPACES.find((ns) => ns._applicationInstances && ns._applicationInstances.size);
    const instance = [...app._applicationInstances][0];
    const router = instance.lookup('router:main');
    const routeNames = Object.keys(router._routerMicrolib.recognizer.names);
    const runtime = require('@fleetbase/ember-core/utils/runtime-engines');
    const extensions = instance.lookup('service:universe/extension-manager');
    const assetLoader = instance.lookup('service:asset-loader');
    const intl = instance.lookup('service:intl');
    const result = {
        accepted: runtime.getRuntimeEngines().map((e) => e.name),
        rejected: runtime.getRejectedRuntimeEngines(),
        mountRoutes: routeNames.filter((n) => n === ${JSON.stringify(mount)} || n.startsWith(${JSON.stringify(`${mount}.`)})).length,
        otherConsoleRoutes: routeNames.filter((n) => n.startsWith('console.') && !n.startsWith(${JSON.stringify(mount)})).length,
        recognized: null,
        configMeta: !!document.querySelector('meta[name="${name}/config/environment"]'),
        inAssetManifest: !!assetLoader.__manifest.bundles[${JSON.stringify(name)}],
        extensionInstalled: extensions.isInstalled(${JSON.stringify(name)}),
        extensionModule: !!window.requirejs.entries[${JSON.stringify(`${name}/extension`)}],
        translated: ${translationKey ? `intl.exists(${JSON.stringify(translationKey)}, 'en-us')` : 'null'},
        engineLoaded: null,
    };
    try {
        result.recognized = instance.lookup('service:router').recognize('/' + ${JSON.stringify(mount.replace(/^console\./, ''))}).name;
    } catch (error) {
        result.recognized = 'error: ' + error.message;
    }
    if (result.accepted.includes(${JSON.stringify(name)})) {
        try {
            const engine = await extensions.loadEngine(${JSON.stringify(name)});
            result.engineLoaded = engine.resolveRegistration('config:environment').modulePrefix;
        } catch (error) {
            result.engineLoaded = 'error: ' + error.message;
        }
    }
    return result;
})()`;

function firstTranslationKey(releaseDir) {
    const translations = JSON.parse(fs.readFileSync(path.join(releaseDir, 'translations.json'), 'utf8'));
    const messages = translations.find(([locale]) => locale === 'en-us')?.[1];
    const walk = (object, prefix) => {
        for (const [key, value] of Object.entries(object ?? {})) {
            const full = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'string') return full;
            const found = walk(value, full);
            if (found) return found;
        }
        return null;
    };
    return walk(messages, '');
}

function runtimeEntry(manifest, origin, extra = {}) {
    return { ...manifest.runtime, name: manifest.name, version: manifest.version, baseUrl: `${origin}/engines-dist/${manifest.name}/`, manifest: 'manifest.json', ...extra };
}

test('a prebuilt engine mounts into a console built without it', { skip: skip ?? false, timeout: 600000 }, async (t) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8'));
    const mount = manifest.runtime.mount.root ? manifest.runtime.mount.as : `console.${manifest.runtime.mount.as}`;
    let mode = 'compatible';

    const server = await serveConsole({
        hostDist: HOST_DIST,
        releaseDir: RELEASE,
        inject: overlay(),
        runtimeManifest: (origin) => ({
            engines: [runtimeEntry(manifest, origin, mode === 'incompatible' ? { requires: ['@fleetbase/ember-ui/components/not-in-any-console'] } : {})],
        }),
    });
    const browser = await launchChrome(CHROME);
    t.after(async () => {
        await browser.close();
        await server.close();
    });

    await t.test('the engine is mounted, set up and loadable', async (st) => {
        await browser.send('Page.navigate', { url: `${server.origin}/` });
        await browser.waitFor(probe(manifest.name));
        const bootRequests = [...server.requests];
        const result = await browser.evaluate(inspect(manifest.name, mount, firstTranslationKey(RELEASE)));
        const logs = browser.logs();
        st.diagnostic(JSON.stringify(result));

        assert.deepEqual(result.rejected, [], 'nothing refused');
        assert.deepEqual(result.accepted, [manifest.name]);
        assert.ok(result.mountRoutes > 1, `the engine's route map is mounted (${result.mountRoutes} routes under ${mount})`);
        assert.ok(result.otherConsoleRoutes > 0, "the console's own routes and mounts are intact");
        assert.ok(result.recognized.startsWith(mount), `/${manifest.runtime.mount.path} resolves into the engine (${result.recognized}), not console.virtual`);
        assert.ok(result.configMeta, 'config meta appended');
        assert.ok(result.inAssetManifest, 'bundle pushed into the asset manifest');
        assert.ok(result.extensionInstalled, 'listed as an installed extension');
        assert.ok(result.extensionModule, 'extension module loaded and run');
        assert.notEqual(result.translated, false, 'its translations are in ember-intl');
        assert.equal(result.engineLoaded, manifest.name, 'the engine bundle loads and boots');
        assert.deepEqual(
            logs.filter((line) => line.includes(manifest.name) && /error|No loader registered|exception/i.test(line)),
            [],
            'no errors about the engine'
        );
        assert.ok(server.requests.some((request) => request.includes(`/engines-dist/${manifest.name}/routes.js`)));

        const engineJs = manifest.runtime.bundle.assets.find((asset) => asset.type === 'js' && /engine(-[0-9a-f]+)?\.js$/.test(asset.uri)).uri;
        if (manifest.runtime.extension === 'extension.js') {
            assert.ok(
                bootRequests.some((request) => request.endsWith(`/engines-dist/${manifest.name}/extension.js`)),
                'the standalone extension module is loaded at boot'
            );
            assert.ok(!bootRequests.some((request) => request.endsWith(`/engines-dist/${manifest.name}/${engineJs}`)), 'and the engine bundle is not: it stays lazy');
        }
        assert.ok(server.requests.some((request) => request.endsWith(`/engines-dist/${manifest.name}/${engineJs}`)), 'the bundle loads when the engine is needed');
    });

    await t.test('a release that needs a module the console lacks is refused and not mounted', async (st) => {
        mode = 'incompatible';
        await browser.send('Page.navigate', { url: `${server.origin}/?incompatible` });
        await browser.waitFor(probe(manifest.name));
        const result = await browser.evaluate(inspect(manifest.name, mount, null));
        st.diagnostic(JSON.stringify(result));

        assert.deepEqual(result.accepted, []);
        assert.equal(result.rejected[0].reason, 'missing-modules');
        assert.deepEqual(result.rejected[0].missing, ['@fleetbase/ember-ui/components/not-in-any-console']);
        assert.equal(result.mountRoutes, 0, 'no routes are mounted');
        assert.ok(!result.recognized.startsWith(mount), `the path falls through to the console (${result.recognized})`);
        assert.equal(result.extensionModule, false, 'and nothing of it is loaded');
    });
});

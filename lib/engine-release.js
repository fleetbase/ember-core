'use strict';

/**
 * Extract a prebuilt engine release from a console build that includes the
 * engine.
 *
 * A console build does more for an engine than write engines-dist/<name>/
 * (see docs/runtime-engines.md). This collects everything a console built
 * WITHOUT the engine needs to mount it at runtime:
 *
 *   <out>/<name>/                engines-dist/<name>/ as built (source maps optional)
 *   <out>/<name>/routes.js       the `<name>/routes` module from the host bundle
 *   <out>/<name>/host-app.js     the engine's `app/` tree re-exported into the host namespace
 *   <out>/<name>/extension.js    the `<name>/extension` module, standalone (when self-contained)
 *   <out>/<name>/translations.json  [[locale, messages], …] from the engine's translations/
 *   <out>/<name>/manifest.json   versions, runtime entry, required host modules, file hashes
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { collectDefinitions, extractModule, externalRequirements } = require('./amd-modules');
const { collectHostModules, hostScripts, readHostVersions, PINNED_PACKAGES, RECORDED_PACKAGES } = require('./engine-compat');

const RELEASE_SCHEMA = 1;
const APP_MODULE_PREFIX = '@fleetbase/console';

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walk(dir, base = dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walk(full, base));
        } else if (entry.isFile()) {
            files.push(path.relative(base, full).split(path.sep).join('/'));
        }
    }
    return files.sort();
}

function copyTree(from, to, { keepMaps = false } = {}) {
    for (const file of walk(from)) {
        if (!keepMaps && file.endsWith('.map')) {
            continue;
        }
        const target = path.join(to, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(from, file), target);
    }
}

/**
 * The content of a `<meta name="…">` tag in index.html, unescaped the way
 * ember-cli escaped it.
 */
function readMeta(html, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const match = new RegExp(`<meta\\s+name="${escaped}"\\s+content="([^"]*)"`).exec(html);
    return match ? JSON.parse(unescape(match[1])) : null;
}

/**
 * The engine's `app/` tree as the module names it becomes in the host
 * namespace: `app/models/foo.js` → `@fleetbase/console/models/foo`.
 */
function appTreeModuleNames(engineDir, appPrefix = APP_MODULE_PREFIX) {
    const appDir = path.join(engineDir, 'app');
    if (!fs.existsSync(appDir)) {
        return [];
    }

    const names = new Set();
    for (const file of walk(appDir)) {
        const match = /^(.*)\.(js|ts|hbs)$/.exec(file);
        if (match) {
            names.add(`${appPrefix}/${match[1]}`);
        }
    }
    return [...names].sort();
}

/**
 * The host-namespace modules that belong to the engine: every
 * `@fleetbase/console/*` module that imports from the engine (ember-engines
 * compiles an engine's `app/` re-exports that way).
 *
 * The engine's `app/` tree is only used to report files that did not end up
 * as such a module: another addon's file of the same name won the merge, or
 * the file is not a re-export. Those are left out, because shipping them would
 * replace the other addon's module in a host that has it.
 */
function extractHostApp(sources, engineName, appModuleNames = [], appPrefix = APP_MODULE_PREFIX) {
    const prefix = `${appPrefix}/`;
    const fromEngine = (dependency) => dependency === engineName || dependency.startsWith(`${engineName}/`);
    const modules = [];
    const seen = new Set();

    for (const source of sources) {
        for (const definition of collectDefinitions(source)) {
            if (definition.name.startsWith(prefix) && !seen.has(definition.name) && definition.dependencies.some(fromEngine)) {
                seen.add(definition.name);
                modules.push({ name: definition.name, code: extractModule(source, definition.name) });
            }
        }
    }

    modules.sort((a, b) => (a.name < b.name ? -1 : 1));
    const skipped = appModuleNames.filter((name) => !seen.has(name));

    return { modules, skipped };
}

/**
 * host-app.js: the extracted modules, each defined only when the host does
 * not define that name already, so a release never replaces a host module.
 */
function wrapHostApp(modules) {
    return [
        '(function (define) {',
        ...modules.map((module) => module.code),
        '})(function (name) {',
        '    if (name in window.requirejs.entries) {',
        "        console.warn('[runtime-engines] The console already defines ' + name + '; keeping its own.');",
        '        return;',
        '    }',
        '    window.define.apply(null, arguments);',
        '});',
        '',
    ].join('\n');
}

/**
 * Translations as ember-intl's `ember-intl/translations` module holds them:
 * `[[locale, messages], …]`, one entry per file in the engine's translations/.
 */
function readTranslations(engineDir, parseYaml) {
    const dir = path.join(engineDir, 'translations');
    if (!fs.existsSync(dir)) {
        return [];
    }

    const translations = [];
    for (const file of walk(dir)) {
        const match = /^(?:.*\/)?([^/]+)\.(ya?ml|json)$/.exec(file);
        if (!match) {
            continue;
        }
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const messages = match[2] === 'json' ? JSON.parse(content) : parseYaml(content);
        translations.push([match[1].toLowerCase(), messages ?? {}]);
    }
    return translations;
}

/**
 * The engine's asset-manifest bundle with URIs made relative to its folder.
 */
function relativeBundle(bundle, engineName) {
    const folder = `engines-dist/${engineName}/`;
    return {
        assets: bundle.assets.map((asset) => {
            const index = asset.uri.indexOf(folder);
            return { ...asset, uri: index === -1 ? asset.uri : asset.uri.slice(index + folder.length) };
        }),
        dependencies: bundle.dependencies ?? [],
    };
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Extract a release from a console build.
 *
 * @param {Object} options
 * @param {string} options.consoleDir console checkout the dist was built from (with the engine installed)
 * @param {string} options.distDir that build's output
 * @param {string} options.engineName package name, e.g. @fleetbase/pallet-engine
 * @param {string} options.outDir release root; the release goes to <outDir>/<engineName>/
 * @param {boolean} [options.keepMaps]
 * @param {Function} [options.parseYaml] YAML parser (defaults to the console's js-yaml)
 * @param {Function} [options.log]
 * @returns {Object} the release manifest
 */
function extractRelease({ consoleDir, distDir, engineName, outDir, keepMaps = false, parseYaml, log = () => {} }) {
    const engineDir = path.dirname(require.resolve(`${engineName}/package.json`, { paths: [consoleDir] }));
    const enginePackage = readJson(path.join(engineDir, 'package.json'));
    const consolePackage = readJson(path.join(consoleDir, 'package.json'));
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const builtFolder = path.join(distDir, 'engines-dist', engineName);

    if (!fs.existsSync(builtFolder)) {
        throw new Error(`${path.relative(process.cwd(), builtFolder)} does not exist: is ${engineName} installed in the console and a lazy engine?`);
    }

    const assetManifest = readMeta(html, `${APP_MODULE_PREFIX}/config/asset-manifest`) ?? readJson(path.join(distDir, 'asset-manifest.json'));
    const bundle = assetManifest?.bundles?.[engineName];
    if (!bundle) {
        throw new Error(`The build's asset manifest has no bundle for ${engineName}.`);
    }

    const config = readMeta(html, `${engineName}/config/environment`);
    if (!config) {
        throw new Error(`index.html has no ${engineName}/config/environment meta tag.`);
    }

    const releaseDir = path.join(outDir, engineName);
    fs.rmSync(releaseDir, { recursive: true, force: true });
    copyTree(builtFolder, releaseDir, { keepMaps });

    const hostSources = hostScripts(distDir).map((script) => fs.readFileSync(path.join(distDir, script), 'utf8'));
    const engineBundle = relativeBundle(bundle, engineName);
    const bundleSources = engineBundle.assets.filter((asset) => asset.type === 'js').map((asset) => fs.readFileSync(path.join(builtFolder, asset.uri), 'utf8'));

    // 1. The route map ember-engines compiles into the host bundle.
    const routes = hostSources.map((source) => extractModule(source, `${engineName}/routes`)).find(Boolean);
    if (!routes) {
        throw new Error(`The host bundle does not define ${engineName}/routes.`);
    }
    fs.writeFileSync(path.join(releaseDir, 'routes.js'), `${routes}\n`);

    // 2. The engine's app/ tree, merged into the host namespace.
    const hostApp = extractHostApp(hostSources, engineName, appTreeModuleNames(engineDir));
    const initializers = hostApp.modules.filter((module) => /\/(instance-)?initializers\//.test(module.name));
    if (initializers.length > 0) {
        throw new Error(`${engineName} adds initializers to the host (${initializers.map((module) => module.name).join(', ')}); runtime engines cannot run them.`);
    }
    hostApp.skipped.forEach((name) => log(`warning: ${name} (from the engine's app/ tree) is not a re-export of the engine in this build; left out`));
    fs.writeFileSync(path.join(releaseDir, 'host-app.js'), wrapHostApp(hostApp.modules));

    // 3. The extension module, standalone when it only imports host modules.
    const extensionName = `${engineName}/extension`;
    const extensionCode = bundleSources.map((source) => extractModule(source, extensionName)).find(Boolean);
    let extension = false;
    if (extensionCode) {
        const { modules: needs } = externalRequirements([extensionCode]);
        const internal = needs.filter((name) => name === engineName || name.startsWith(`${engineName}/`));
        if (internal.length === 0) {
            fs.writeFileSync(path.join(releaseDir, 'extension.js'), `${extensionCode}\n`);
            extension = 'extension.js';
        } else {
            log(`warning: ${extensionName} imports ${internal.join(', ')}; it will load the whole bundle at boot`);
            extension = true;
        }
    }

    // 4. Translations, which ember-intl only merges for engines the host is built with.
    const translations = readTranslations(engineDir, parseYaml ?? defaultYamlParser(consoleDir));
    fs.writeFileSync(path.join(releaseDir, 'translations.json'), JSON.stringify(translations));

    // 5. What the release needs from the host: modules the bundle aliases or
    //    imports without defining them. Only modules the build host defined
    //    count; the rest are dangling in every build and never required.
    const buildHostModules = new Set(collectHostModules(distDir));
    const requirements = externalRequirements([...bundleSources, routes, ...hostApp.modules.map((module) => module.code)]);
    const provided = (name) => buildHostModules.has(name) || buildHostModules.has(`${name}/index`);

    const versions = readHostVersions(consoleDir);
    const builtAgainst = {};
    for (const packageName of [...PINNED_PACKAGES, ...RECORDED_PACKAGES]) {
        builtAgainst[packageName] = versions[packageName];
    }

    const route = enginePackage.fleetbase?.route ?? engineName.split('/').pop().replace('-engine', '');
    const runtime = {
        mount: { as: route, path: route, root: enginePackage.fleetbase?.mount === 'root' },
        bundle: engineBundle,
        config,
        routes: 'routes.js',
        hostApp: 'host-app.js',
        translations: 'translations.json',
        extension,
    };

    const files = {};
    for (const file of walk(releaseDir)) {
        files[file] = `sha256-${sha256(path.join(releaseDir, file))}`;
    }

    const manifest = {
        schema: RELEASE_SCHEMA,
        name: engineName,
        version: enginePackage.version,
        builtAt: new Date().toISOString(),
        builtWith: { console: consolePackage.version, environment: config.environment ?? null },
        builtAgainst,
        runtime,
        requires: {
            modules: requirements.modules.filter(provided),
            aliases: requirements.aliases.filter(provided),
            unresolved: requirements.modules.filter((name) => !provided(name)),
        },
        hostApp: { modules: hostApp.modules.length, skipped: hostApp.skipped },
        files,
    };

    fs.writeFileSync(path.join(releaseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

/**
 * js-yaml from the console checkout (ember-intl's own dependency), so the
 * builder adds no dependency to ember-core.
 */
function defaultYamlParser(consoleDir) {
    return (content) => {
        const intlDir = path.dirname(require.resolve('ember-intl/package.json', { paths: [consoleDir] }));
        const yaml = require(require.resolve('js-yaml', { paths: [intlDir] }));
        return yaml.load(content);
    };
}

module.exports = {
    RELEASE_SCHEMA,
    readMeta,
    appTreeModuleNames,
    extractHostApp,
    wrapHostApp,
    readTranslations,
    relativeBundle,
    extractRelease,
    walk,
};

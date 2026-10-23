'use strict';

/**
 * Compatibility of a prebuilt engine release with a console build.
 *
 * A lazy engine bundle does not carry the shared addons it was built with
 * (ember-engines dedupes them against the host); instead it aliases and
 * imports the host's modules by name, as they were in the versions it was
 * built against, and component lookups do not fall back to the host. A release
 * whose `requires.modules` lists a module the host does not define breaks the
 * first time that module is needed, so the installer refuses it.
 *
 * Host side: `host-modules.json`, written next to a console build (by the
 * console's build, or with bin/host-modules.js):
 *
 *     { "schema": 1, "console": "0.7.69",
 *       "versions": { "@fleetbase/ember-ui": "0.4.6", "@fleetbase/ember-core": "0.3.26", … },
 *       "modules": ["@ember/component/index", …] }
 *
 * Release side: the `manifest.json` written by bin/build-engine-release.js
 * (`builtAgainst` and `requires.modules`).
 */

const fs = require('fs');
const path = require('path');
const { collectDefinedModules } = require('./amd-modules');

const HOST_MODULES_SCHEMA = 1;

/**
 * Packages whose versions an engine release is pinned to. The engine bundle
 * aliases every module of these at the version it was built against.
 */
const PINNED_PACKAGES = ['@fleetbase/ember-ui', '@fleetbase/ember-core'];

/**
 * Packages recorded for diagnosis; a different major is refused.
 */
const RECORDED_PACKAGES = ['ember-source', 'ember-engines', 'ember-data', 'ember-intl', 'ember-auto-import'];

/**
 * The classic scripts a console's index.html loads from its own assets, in
 * order.
 *
 * @param {string} distDir
 * @returns {string[]} paths relative to distDir
 */
function hostScripts(distDir) {
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    return Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), (match) => match[1])
        .filter((src) => !/^([a-z]+:)?\/\//i.test(src))
        .map((src) => src.replace(/^\//, '').split('?')[0])
        .filter((src) => src.startsWith('assets/') && fs.existsSync(path.join(distDir, src)));
}

/**
 * Every module a console build defines at boot.
 *
 * @param {string} distDir
 * @returns {string[]} sorted module names
 */
function collectHostModules(distDir) {
    const modules = new Set();

    for (const script of hostScripts(distDir)) {
        const source = fs.readFileSync(path.join(distDir, script), 'utf8');
        for (const name of collectDefinedModules(source, { autoImport: path.basename(script).startsWith('chunk.') })) {
            modules.add(name);
        }
    }

    return [...modules].sort();
}

function readPackageVersion(fromDir, packageName) {
    try {
        const file = require.resolve(`${packageName}/package.json`, { paths: [fromDir] });
        return JSON.parse(fs.readFileSync(file, 'utf8')).version;
    } catch {
        return null;
    }
}

/**
 * The installed versions of the pinned and recorded packages in a console
 * checkout.
 *
 * @param {string} consoleDir
 * @returns {Object<string, string|null>}
 */
function readHostVersions(consoleDir) {
    const versions = {};
    for (const packageName of [...PINNED_PACKAGES, ...RECORDED_PACKAGES]) {
        versions[packageName] = readPackageVersion(consoleDir, packageName);
    }
    return versions;
}

/**
 * Build the host-modules.json document for a console build.
 *
 * @param {string} distDir
 * @param {{consoleDir?: string}} [options] checkout the dist was built from, for versions
 * @returns {Object}
 */
function buildHostModules(distDir, { consoleDir } = {}) {
    let consoleVersion = null;
    let versions = {};

    if (consoleDir) {
        consoleVersion = JSON.parse(fs.readFileSync(path.join(consoleDir, 'package.json'), 'utf8')).version;
        versions = readHostVersions(consoleDir);
    }

    return { schema: HOST_MODULES_SCHEMA, console: consoleVersion, versions, modules: collectHostModules(distDir) };
}

/**
 * Load the host side of a check: a host-modules.json file, or a dist
 * directory (with or without one inside it).
 *
 * @param {string} hostPath
 * @returns {Object}
 */
function loadHost(hostPath) {
    if (fs.statSync(hostPath).isDirectory()) {
        const file = path.join(hostPath, 'host-modules.json');
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : buildHostModules(hostPath);
    }

    return JSON.parse(fs.readFileSync(hostPath, 'utf8'));
}

function parseVersion(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? ''));
    return match ? match.slice(1, 4).map(Number) : null;
}

/**
 * Compare one package's built-against version with the host's.
 *
 * Policies: `exact` (same version), `minor` (same major.minor, the default for
 * pinned packages), `modules` (versions are informational; only the module
 * check decides). Recorded packages are only refused on a major mismatch.
 */
function compareVersion(packageName, built, host, policy) {
    const result = { package: packageName, built: built ?? null, host: host ?? null, ok: true, note: null };
    const b = parseVersion(built);
    const h = parseVersion(host);

    if (!b || !h) {
        result.note = 'unknown version, not compared';
        return result;
    }

    const pinned = PINNED_PACKAGES.includes(packageName);
    if (pinned && policy === 'exact') {
        result.ok = built === host;
    } else if (pinned && policy === 'minor') {
        result.ok = b[0] === h[0] && b[1] === h[1];
    } else {
        result.ok = b[0] === h[0];
    }

    if (result.ok && built !== host) {
        result.note = 'differs, allowed by policy';
    }

    return result;
}

/**
 * Check a release manifest against a host.
 *
 * @param {Object} manifest release manifest.json
 * @param {Object} host host-modules.json document
 * @param {{policy?: 'exact'|'minor'|'modules'}} [options]
 * @returns {{compatible: boolean, missing: string[], versions: Object[], reasons: string[]}}
 */
function checkEngineCompat(manifest, host, { policy = 'minor' } = {}) {
    const modules = new Set(host.modules ?? []);
    const required = manifest.requires?.modules ?? [];
    const missing = required.filter((name) => !modules.has(name) && !modules.has(`${name}/index`));

    const builtAgainst = manifest.builtAgainst ?? {};
    const hostVersions = host.versions ?? {};
    const versions = Object.keys(builtAgainst).map((packageName) => compareVersion(packageName, builtAgainst[packageName], hostVersions[packageName], policy));

    const reasons = [];
    if (missing.length > 0) {
        reasons.push(`the console does not define ${missing.length} module(s) the engine needs`);
    }
    for (const version of versions.filter((entry) => !entry.ok)) {
        reasons.push(`${version.package} ${version.built} (built against) is not compatible with ${version.host} (console)`);
    }

    return { compatible: reasons.length === 0, missing, versions, reasons };
}

module.exports = {
    HOST_MODULES_SCHEMA,
    PINNED_PACKAGES,
    RECORDED_PACKAGES,
    hostScripts,
    collectHostModules,
    readHostVersions,
    buildHostModules,
    loadHost,
    compareVersion,
    checkEngineCompat,
};

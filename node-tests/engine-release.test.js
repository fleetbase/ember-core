'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractRelease, readMeta, relativeBundle, wrapHostApp } = require('../lib/engine-release');
const { buildHostModules, checkEngineCompat, compareVersion, loadHost } = require('../lib/engine-compat');

const ENGINE = '@acme/widgets-engine';
const BIN = path.join(__dirname, '..', 'bin');
const fixtures = [];

test.after(() => fixtures.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function write(root, file, content) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
}

/**
 * A console checkout with the engine installed and a development build of it:
 * the same layout `ember build` produces, reduced to what the extractor reads.
 */
function makeFixture({ uiVersion = '0.4.6', hostModules = ['button', 'modal'] } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-release-test-'));
    fixtures.push(root);
    const consoleDir = path.join(root, 'console');
    const distDir = path.join(root, 'dist');

    write(consoleDir, 'package.json', { name: '@fleetbase/console', version: '0.7.69' });
    write(consoleDir, 'node_modules/@fleetbase/ember-ui/package.json', { name: '@fleetbase/ember-ui', version: uiVersion });
    write(consoleDir, 'node_modules/@fleetbase/ember-core/package.json', { name: '@fleetbase/ember-core', version: '0.3.26' });
    write(consoleDir, `node_modules/${ENGINE}/package.json`, { name: ENGINE, version: '1.2.0', fleetbase: { route: 'widgets' } });
    write(consoleDir, `node_modules/${ENGINE}/app/models/widget.js`, `export { default } from '${ENGINE}/models/widget';`);
    write(consoleDir, `node_modules/${ENGINE}/app/routes/home.js`, `export { default } from '${ENGINE}/routes/home';`);
    write(consoleDir, `node_modules/${ENGINE}/translations/en-us.yaml`, 'widgets: Widgets');
    write(consoleDir, `node_modules/${ENGINE}/translations/README.md`, 'not a translation');

    const config = { modulePrefix: ENGINE, environment: 'development' };
    const bundle = {
        assets: [
            { uri: `/engines-dist/${ENGINE}/assets/engine.js`, type: 'js' },
            { uri: `/engines-dist/${ENGINE}/assets/engine.css`, type: 'css' },
        ],
    };
    const manifestMeta = escape(JSON.stringify({ bundles: { [ENGINE]: bundle } }));
    write(
        distDir,
        'index.html',
        `<html><head>
<meta name="${ENGINE}/config/environment" content="${escape(JSON.stringify(config))}" />
<meta name="@fleetbase/console/config/asset-manifest" content="${manifestMeta}" />
</head><body>
<script src="/assets/vendor.js"></script>
<script src="/assets/chunk.app.js"></script>
<script src="https://cdn.example.test/external.js"></script>
<script src="/assets/@fleetbase/console.js"></script>
</body></html>`
    );
    write(
        distDir,
        'assets/vendor.js',
        [
            ...hostModules.map((name) => `define("@fleetbase/ember-ui/components/${name}", ["exports"], function () {});`),
            'define("ember-engines/routes", ["exports"], function () {});',
            'define("@ember/component/index", ["exports"], function () {});',
            `define("${ENGINE}/routes", ["exports", "ember-engines/routes"], function (e, r) {\n  e.default = (0, r.default)(function () { this.route('home', { path: '/' }); });\n});`,
        ].join('\n')
    );
    write(distDir, 'assets/chunk.app.js', "d('lodash', [], function () {});");
    write(
        distDir,
        'assets/@fleetbase/console.js',
        [
            `define("@fleetbase/console/models/widget", ["exports", "${ENGINE}/models/widget"], function () {});`,
            `define("@fleetbase/console/serializers/widget", ["exports", "${ENGINE}/serializers/widget"], function () {});`,
            'define("@fleetbase/console/routes/home", ["exports", "@acme/other-engine/routes/home"], function () {});',
            'define("@fleetbase/console/app", ["exports"], function () {});',
        ].join('\n')
    );
    write(
        distDir,
        `engines-dist/${ENGINE}/assets/engine.js`,
        [
            `define("${ENGINE}/engine", ["exports", "@ember/component", "lodash"], function () {});`,
            `define("${ENGINE}/models/widget", ["exports"], function () {});`,
            `define("${ENGINE}/serializers/widget", ["exports"], function () {});`,
            `define("${ENGINE}/extension", ["exports", "@fleetbase/ember-core/contracts"], function (e) { e.default = {}; });`,
            `define.alias("@fleetbase/ember-ui/components/button", "${ENGINE}/components/button");`,
            `define.alias("@fleetbase/ember-ui/components/modal", "${ENGINE}/components/modal");`,
            `define.alias("@fleetbase/ember-ui/utils/dangling", "${ENGINE}/utils/dangling");`,
        ].join('\n')
    );
    write(distDir, `engines-dist/${ENGINE}/assets/engine.css`, '.widget {}');
    write(distDir, `engines-dist/${ENGINE}/assets/engine.map`, '{}');

    return { root, consoleDir, distDir, outDir: path.join(root, 'out') };
}

const parseYaml = (content) => Object.fromEntries(content.split('\n').map((line) => line.split(': ')));

test('a release is extracted with every artifact a runtime mount needs', () => {
    const fixture = makeFixture();
    const logs = [];

    const manifest = extractRelease({ ...fixture, engineName: ENGINE, parseYaml, log: (message) => logs.push(message) });
    const release = path.join(fixture.outDir, ENGINE);

    assert.deepEqual(fs.readdirSync(release).sort(), ['assets', 'extension.js', 'host-app.js', 'manifest.json', 'routes.js', 'translations.json']);
    assert.ok(!fs.existsSync(path.join(release, 'assets/engine.map')), 'source maps are left out by default');
    assert.match(fs.readFileSync(path.join(release, 'routes.js'), 'utf8'), /^define\("@acme\/widgets-engine\/routes"/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(release, 'translations.json'), 'utf8')), [['en-us', { widgets: 'Widgets' }]]);
    assert.match(fs.readFileSync(path.join(release, 'extension.js'), 'utf8'), /define\("@acme\/widgets-engine\/extension"/);

    const hostApp = fs.readFileSync(path.join(release, 'host-app.js'), 'utf8');
    assert.match(hostApp, /@fleetbase\/console\/models\/widget/, 'a re-export from the app tree');
    assert.match(hostApp, /@fleetbase\/console\/serializers\/widget/, 'a re-export of the engine not in the app tree');
    assert.doesNotMatch(hostApp, /@fleetbase\/console\/routes\/home/, "another engine's module of the same name is left out");
    assert.deepEqual(manifest.hostApp, { modules: 2, skipped: ['@fleetbase/console/routes/home'] });
    assert.match(logs[0], /routes\/home .* left out/);

    assert.equal(manifest.name, ENGINE);
    assert.equal(manifest.version, '1.2.0');
    assert.deepEqual(manifest.builtWith, { console: '0.7.69', environment: 'development' });
    assert.equal(manifest.builtAgainst['@fleetbase/ember-ui'], '0.4.6');
    assert.equal(manifest.builtAgainst['@fleetbase/ember-core'], '0.3.26');
    assert.deepEqual(manifest.runtime.mount, { as: 'widgets', path: 'widgets', root: false });
    assert.deepEqual(manifest.runtime.bundle.assets, [
        { uri: 'assets/engine.js', type: 'js' },
        { uri: 'assets/engine.css', type: 'css' },
    ]);
    assert.deepEqual(manifest.runtime.config, { modulePrefix: ENGINE, environment: 'development' });
    assert.equal(manifest.runtime.extension, 'extension.js');
    assert.deepEqual(manifest.requires.modules, [
        '@ember/component',
        '@fleetbase/ember-ui/components/button',
        '@fleetbase/ember-ui/components/modal',
        'ember-engines/routes',
        'lodash',
    ]);
    assert.deepEqual(manifest.requires.aliases, ['@fleetbase/ember-ui/components/button', '@fleetbase/ember-ui/components/modal']);
    assert.deepEqual(
        manifest.requires.unresolved,
        ['@fleetbase/ember-core/contracts', '@fleetbase/ember-ui/utils/dangling'],
        'modules the build host did not define either'
    );
    assert.match(manifest.files['assets/engine.js'], /^sha256-[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(manifest.files).sort(), ['assets/engine.css', 'assets/engine.js', 'extension.js', 'host-app.js', 'routes.js', 'translations.json']);
});

test('an extension that imports engine internals is not shipped standalone', () => {
    const fixture = makeFixture();
    const engineJs = path.join(fixture.distDir, `engines-dist/${ENGINE}/assets/engine.js`);
    fs.writeFileSync(engineJs, fs.readFileSync(engineJs, 'utf8').replace('"@fleetbase/ember-core/contracts"', `"${ENGINE}/utils/menu"`));
    const logs = [];

    const manifest = extractRelease({ ...fixture, engineName: ENGINE, parseYaml, keepMaps: true, log: (message) => logs.push(message) });

    assert.equal(manifest.runtime.extension, true);
    assert.ok(!fs.existsSync(path.join(fixture.outDir, ENGINE, 'extension.js')));
    assert.ok(logs.some((message) => message.includes('load the whole bundle')));
    assert.ok(fs.existsSync(path.join(fixture.outDir, ENGINE, 'assets/engine.map')), 'maps kept on request');
});

test('engines that need what a runtime mount cannot give are refused', () => {
    const fixture = makeFixture();
    const consoleJs = path.join(fixture.distDir, 'assets/@fleetbase/console.js');
    fs.appendFileSync(consoleJs, `\ndefine("@fleetbase/console/initializers/widgets", ["exports", "${ENGINE}/initializers/widgets"], function () {});`);
    assert.throws(() => extractRelease({ ...fixture, engineName: ENGINE, parseYaml }), /adds initializers to the host/);

    const vendor = path.join(fixture.distDir, 'assets/vendor.js');
    fs.writeFileSync(vendor, fs.readFileSync(vendor, 'utf8').replace(`define("${ENGINE}/routes"`, 'define("x/routes"'));
    assert.throws(() => extractRelease({ ...fixture, engineName: ENGINE, parseYaml }), /does not define @acme\/widgets-engine\/routes/);
});

test('a build without the engine, its bundle or its config is an error', () => {
    const fixture = makeFixture();
    const html = path.join(fixture.distDir, 'index.html');

    fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(`${ENGINE}/config/environment`, 'other/config/environment'));
    assert.throws(() => extractRelease({ ...fixture, engineName: ENGINE, parseYaml }), /no @acme\/widgets-engine\/config\/environment meta/);

    fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/<meta name="@fleetbase\/console\/config\/asset-manifest"[^>]*>/, ''));
    write(fixture.distDir, 'asset-manifest.json', { bundles: {} });
    assert.throws(() => extractRelease({ ...fixture, engineName: ENGINE, parseYaml }), /no bundle for @acme\/widgets-engine/);

    fs.rmSync(path.join(fixture.distDir, 'engines-dist'), { recursive: true });
    assert.throws(() => extractRelease({ ...fixture, engineName: ENGINE, parseYaml }), /is @acme\/widgets-engine installed/);
});

test('helpers: meta tags, bundle paths and the host-app guard', () => {
    assert.equal(readMeta('<meta name="a/b" content="%7B%22x%22%3A1%7D">', 'a/b').x, 1);
    assert.equal(readMeta('<html></html>', 'a/b'), null);
    assert.deepEqual(relativeBundle({ assets: [{ uri: 'https://cdn.test/engines-dist/e/assets/a.js' }, { uri: '/shared/b.js' }] }, 'e'), {
        assets: [{ uri: 'assets/a.js' }, { uri: '/shared/b.js' }],
        dependencies: [],
    });

    const defined = [];
    const window = { requirejs: { entries: { 'x/existing': {} } }, define: (name) => defined.push(name) };
    const console = { warn: () => {} };
    new Function('window', 'console', wrapHostApp([{ code: 'define("x/existing", [], function () {});' }, { code: 'define("x/new", [], function () {});' }]))(window, console);
    assert.deepEqual(defined, ['x/new'], 'a host module is never replaced');
});

test('the compat check refuses missing modules and pinned version drift', () => {
    const fixture = makeFixture();
    const manifest = extractRelease({ ...fixture, engineName: ENGINE, parseYaml });

    const same = buildHostModules(fixture.distDir, { consoleDir: fixture.consoleDir });
    assert.equal(same.console, '0.7.69');
    assert.ok(same.modules.includes('lodash'), 'auto-import registrations count for the host');
    assert.ok(!same.modules.includes('external'), 'external scripts are not read');
    assert.deepEqual(checkEngineCompat(manifest, same).compatible, true);

    const older = makeFixture({ uiVersion: '0.4.4', hostModules: ['button'] });
    const olderHost = buildHostModules(older.distDir, { consoleDir: older.consoleDir });
    const result = checkEngineCompat(manifest, olderHost);
    assert.equal(result.compatible, false);
    assert.deepEqual(result.missing, ['@fleetbase/ember-ui/components/modal']);
    assert.equal(result.reasons.length, 1, 'same minor: only the module is a reason');

    const nextMinor = { ...olderHost, modules: same.modules, versions: { ...olderHost.versions, '@fleetbase/ember-ui': '0.5.0' } };
    assert.match(checkEngineCompat(manifest, nextMinor).reasons[0], /@fleetbase\/ember-ui 0.4.6 .* not compatible with 0.5.0/);
    assert.equal(checkEngineCompat(manifest, nextMinor, { policy: 'modules' }).compatible, true, 'the modules policy only checks modules');
    assert.equal(checkEngineCompat({}, { modules: [] }).compatible, true, 'an empty manifest needs nothing');
});

test('version comparison by policy', () => {
    assert.equal(compareVersion('@fleetbase/ember-ui', '0.4.6', '0.4.6', 'exact').ok, true);
    assert.equal(compareVersion('@fleetbase/ember-ui', '0.4.6', '0.4.7', 'exact').ok, false);
    assert.deepEqual(compareVersion('@fleetbase/ember-ui', '0.4.6', '0.4.7', 'minor'), {
        package: '@fleetbase/ember-ui',
        built: '0.4.6',
        host: '0.4.7',
        ok: true,
        note: 'differs, allowed by policy',
    });
    assert.equal(compareVersion('ember-source', '5.4.1', '5.12.0', 'minor').ok, true, 'recorded packages only refuse a new major');
    assert.equal(compareVersion('ember-source', '5.4.1', '6.0.0', 'minor').ok, false);
    assert.equal(compareVersion('ember-source', null, '6.0.0', 'minor').note, 'unknown version, not compared');
});

test('the CLIs write the host list and gate on compatibility', () => {
    const fixture = makeFixture();
    extractRelease({ ...fixture, engineName: ENGINE, parseYaml });
    const manifestPath = path.join(fixture.outDir, ENGINE, 'manifest.json');
    const run = (script, args) => spawnSync(process.execPath, [path.join(BIN, script), ...args], { encoding: 'utf8' });

    const written = run('host-modules.js', ['--dist', fixture.distDir, '--console', fixture.consoleDir]);
    assert.equal(written.status, 0, written.stderr);
    const hostFile = path.join(fixture.distDir, 'host-modules.json');
    assert.equal(loadHost(hostFile).console, '0.7.69');
    assert.equal(loadHost(fixture.distDir).console, '0.7.69', 'a dist with host-modules.json uses it');

    const ok = run('check-engine-compat.js', ['--manifest', manifestPath, '--host', hostFile]);
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /compatible/);

    fs.rmSync(hostFile);
    const older = makeFixture({ hostModules: ['button'] });
    const refused = run('check-engine-compat.js', ['--manifest', manifestPath, '--host', older.distDir, '--json']);
    assert.equal(refused.status, 1);
    assert.deepEqual(JSON.parse(refused.stdout).missing, ['@fleetbase/ember-ui/components/modal']);

    assert.equal(run('check-engine-compat.js', ['--manifest', manifestPath]).status, 2);
    assert.equal(run('check-engine-compat.js', ['--manifest', manifestPath, '--host', hostFile, '--policy', 'loose']).status, 2);
    assert.equal(run('host-modules.js', []).status, 2);
    assert.equal(run('build-engine-release.js', []).status, 2);
    assert.equal(run('build-engine-release.js', ['--help']).status, 0);
});

test('build-engine-release extracts from an existing dist', () => {
    const fixture = makeFixture();
    // The CLI uses the console's js-yaml; this fixture has none, so give the engine JSON translations.
    const translations = path.join(fixture.consoleDir, `node_modules/${ENGINE}/translations`);
    fs.rmSync(translations, { recursive: true });
    write(translations, 'en-us.json', { widgets: 'Widgets' });

    const args = ['--console', fixture.consoleDir, '--engine', ENGINE, '--dist', fixture.distDir, '--out', fixture.outDir];
    const result = spawnSync(process.execPath, [path.join(BIN, 'build-engine-release.js'), ...args], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /@acme\/widgets-engine@1\.2\.0/);
    assert.match(result.stdout, /built against @fleetbase\/ember-ui@0\.4\.6, @fleetbase\/ember-core@0\.3\.26/);
    assert.match(result.stdout, /extension: standalone/);
    assert.ok(fs.existsSync(path.join(fixture.outDir, ENGINE, 'manifest.json')));
});

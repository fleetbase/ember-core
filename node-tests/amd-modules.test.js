'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectAliases, collectDefinedModules, collectDefinitions, extractModule, externalRequirements, resolveDependency } = require('../lib/amd-modules');

const DEV_BUNDLE = `
define("@acme/widgets-engine/routes", ["exports", "ember-engines/routes"], function (_exports, _routes) {
  "use strict";
  // a comment with a ) and a "quote
  var re = /[)}"']+/g;
  var tpl = \`) \${ "}" } \`;
  _exports.default = (0, _routes.default)(function () {
    this.route('home', { path: '/' });
  });
});
define("@acme/widgets-engine/components/thing", ["exports", "@fleetbase/ember-ui/components/button", "./helper"], function () {});
define.alias("@fleetbase/ember-ui/components/modal", "@acme/widgets-engine/components/modal");
define.alias("@acme/widgets-engine/components/thing", "@acme/widgets-engine/components/thing-alias");
`;

const MINIFIED_BUNDLE =
    'define("a/one",["exports","b/two"],(function(e,t){"use strict";var n=t.x/2/1;e.default=n>1?")":"("}));define(\'a/two\',[],(function(){return{}}));define.alias("b/three","a/three")';

test('it lists the modules a bundle defines, including aliases', () => {
    assert.deepEqual(
        [...collectDefinedModules(DEV_BUNDLE)].sort(),
        ['@acme/widgets-engine/components/modal', '@acme/widgets-engine/components/thing', '@acme/widgets-engine/components/thing-alias', '@acme/widgets-engine/routes']
    );
    assert.deepEqual([...collectDefinedModules(MINIFIED_BUNDLE)].sort(), ['a/one', 'a/three', 'a/two']);
});

test('ember-auto-import registrations count only when asked for', () => {
    const chunk = "eval(\"var d = _eai_d;\\n d('lodash', [], function() {}); d('@floating-ui/dom', [], function() {});\")";

    assert.deepEqual([...collectDefinedModules(chunk)], []);
    assert.deepEqual([...collectDefinedModules(chunk, { autoImport: true })].sort(), ['@floating-ui/dom', 'lodash']);
});

test('a call that only ends in "define" is not a definition', () => {
    assert.deepEqual([...collectDefinedModules('window.define("x", []); _define("y", []); define("z", [])')], ['z']);
});

test('it lists aliases as target and alias', () => {
    assert.deepEqual(collectAliases(DEV_BUNDLE), [
        { target: '@fleetbase/ember-ui/components/modal', alias: '@acme/widgets-engine/components/modal' },
        { target: '@acme/widgets-engine/components/thing', alias: '@acme/widgets-engine/components/thing-alias' },
    ]);
});

test('dependencies are read and resolved like loader.js does', () => {
    const definitions = collectDefinitions(DEV_BUNDLE);

    assert.deepEqual(definitions[0].dependencies, ['ember-engines/routes'], 'exports is not a dependency');
    assert.deepEqual(definitions[1].dependencies, ['@fleetbase/ember-ui/components/button', '@acme/widgets-engine/components/helper']);
    assert.deepEqual(collectDefinitions('define("x", function () {})')[0].dependencies, [], 'a define without a dependency list');

    assert.equal(resolveDependency('../utils/a', '@acme/e/components/x/y'), '@acme/e/components/utils/a');
    assert.equal(resolveDependency('./b', '@acme/e/c'), '@acme/e/b');
    assert.equal(resolveDependency('lodash', '@acme/e/c'), 'lodash');
});

test('a module is extracted whole, past strings, comments, regexes and templates', () => {
    const routes = extractModule(DEV_BUNDLE, '@acme/widgets-engine/routes');

    assert.ok(routes.startsWith('define("@acme/widgets-engine/routes"'));
    assert.ok(routes.endsWith('});'), 'with its semicolon');
    assert.ok(routes.includes("this.route('home'"));
    assert.ok(!routes.includes('components/thing'), 'and nothing of the next module');
});

test('minified modules are extracted, with either quote style', () => {
    assert.equal(extractModule(MINIFIED_BUNDLE, 'a/one'), 'define("a/one",["exports","b/two"],(function(e,t){"use strict";var n=t.x/2/1;e.default=n>1?")":"("}));');
    assert.equal(extractModule(MINIFIED_BUNDLE, 'a/two'), "define('a/two',[],(function(){return{}}));");
    assert.equal(extractModule(MINIFIED_BUNDLE, 'a/missing'), null);
    assert.equal(extractModule('x.define("a/one", [])', 'a/one'), null, 'a property call is not the module');
});

test('regex literals after keywords and division after values are told apart', () => {
    const source = 'define("k", [], function () { if (a) return /\\)/.test(b); var c = (d) / 2 / (e); return typeof /[/)]/; });define("next", [])';
    assert.equal(extractModule(source, 'k'), 'define("k", [], function () { if (a) return /\\)/.test(b); var c = (d) / 2 / (e); return typeof /[/)]/; });');
});

test('unterminated input does not loop forever', () => {
    assert.equal(extractModule('define("u", [], function () { var s = "open', 'u'), 'define("u", [], function () { var s = "open');
    assert.equal(extractModule('define("u", [], function () { /* open', 'u'), 'define("u", [], function () { /* open');
    assert.equal(extractModule('define("u", [], function () { // open', 'u'), 'define("u", [], function () { // open');
    assert.equal(extractModule('define("u", [], function () { `x ${ "y" ', 'u'), 'define("u", [], function () { `x ${ "y" ');
});

test('external requirements are what the bundles alias or import without defining', () => {
    const engineVendor = 'define("@acme/widgets-engine/components/helper", ["exports", "@ember/component"], function () {});';
    const { modules, aliases, defined } = externalRequirements([DEV_BUNDLE, engineVendor]);

    assert.deepEqual(aliases, ['@fleetbase/ember-ui/components/modal']);
    assert.deepEqual(modules, ['@ember/component', '@fleetbase/ember-ui/components/button', '@fleetbase/ember-ui/components/modal', 'ember-engines/routes']);
    assert.ok(defined.has('@acme/widgets-engine/components/helper'));
});

test('a requirement met by an index module is not external', () => {
    const { modules } = externalRequirements(['define("a", ["b/c"], function () {}); define("b/c/index", [], function () {});']);
    assert.deepEqual(modules, []);
});

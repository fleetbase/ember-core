'use strict';

/**
 * Reading loader.js AMD bundles (vendor.js, the app bundle, engine.js) as text:
 * which modules a bundle defines, which it aliases, what each module imports,
 * and the exact source of one `define(...)` call.
 *
 * Works on both development and minified production output. Extraction scans
 * the call with a small tokenizer that skips strings, template literals,
 * comments and regular expression literals, so it does not depend on the
 * bundle's formatting.
 */

const DEFINE_PATTERN = /(?<![\w$.])define\(\s*(["'])([^"'\\\n]+)\1/g;
const ALIAS_PATTERN = /(?<![\w$.])define\.alias\(\s*(["'])([^"'\\\n]+)\1\s*,\s*(["'])([^"'\\\n]+)\3\s*\)/g;
// ember-auto-import registers npm packages through a local alias of define
// (`d('lodash', [], function () { … })`, minified to any short name), in
// source that may itself sit inside an eval string in development builds.
const AUTO_IMPORT_PATTERN = /(?<![\w$.])[A-Za-z_$][\w$]{0,5}\(\s*\\?(["'])((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.@-]+)*)\\?\1\s*,\s*\[/g;
const PSEUDO_DEPENDENCIES = new Set(['exports', 'require', 'module']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * Every module name a bundle defines with `define("name", …)` or as the alias
 * side of `define.alias(target, alias)`.
 *
 * @param {string} source
 * @param {{autoImport?: boolean}} [options] also read ember-auto-import registrations (host chunks)
 * @returns {Set<string>}
 */
function collectDefinedModules(source, { autoImport = false } = {}) {
    const names = new Set();

    for (const match of source.matchAll(DEFINE_PATTERN)) {
        names.add(match[2]);
    }

    for (const alias of collectAliases(source)) {
        names.add(alias.alias);
    }

    if (autoImport) {
        for (const match of source.matchAll(AUTO_IMPORT_PATTERN)) {
            names.add(match[2]);
        }
    }

    return names;
}

/**
 * Every `define.alias(target, alias)` in a bundle. The target must exist when
 * the alias is required; the alias is the name the bundle provides.
 *
 * @param {string} source
 * @returns {Array<{target: string, alias: string}>}
 */
function collectAliases(source) {
    return Array.from(source.matchAll(ALIAS_PATTERN), (match) => ({ target: match[2], alias: match[4] }));
}

/**
 * Resolve a dependency the way loader.js does: relative to the importing
 * module's directory.
 *
 * @param {string} dependency
 * @param {string} moduleName
 * @returns {string}
 */
function resolveDependency(dependency, moduleName) {
    if (!dependency.startsWith('./') && !dependency.startsWith('../')) {
        return dependency;
    }

    const parts = moduleName.split('/').slice(0, -1);
    for (const segment of dependency.split('/')) {
        if (segment === '..') {
            parts.pop();
        } else if (segment !== '.') {
            parts.push(segment);
        }
    }

    return parts.join('/');
}

/**
 * Every `define()` call in a bundle with the dependencies it declares.
 *
 * @param {string} source
 * @returns {Array<{name: string, start: number, dependencies: string[]}>}
 */
function collectDefinitions(source) {
    const definitions = [];

    for (const match of source.matchAll(DEFINE_PATTERN)) {
        const name = match[2];
        const after = source.slice(match.index + match[0].length, match.index + match[0].length + 20000);
        const list = /^\s*,\s*\[([^\]]*)\]/.exec(after);
        const dependencies = list ? Array.from(list[1].matchAll(/(["'])([^"']+)\1/g), (dep) => resolveDependency(dep[2], name)).filter((dep) => !PSEUDO_DEPENDENCIES.has(dep)) : [];

        definitions.push({ name, start: match.index, dependencies });
    }

    return definitions;
}

function skipString(source, index) {
    const quote = source[index];
    let i = index + 1;
    while (i < source.length) {
        const char = source[i];
        if (char === '\\') {
            i += 2;
            continue;
        }
        if (char === quote || char === '\n') {
            return i + 1;
        }
        i++;
    }
    return i;
}

function skipTemplate(source, index) {
    let i = index + 1;
    while (i < source.length) {
        const char = source[i];
        if (char === '\\') {
            i += 2;
            continue;
        }
        if (char === '`') {
            return i + 1;
        }
        if (char === '$' && source[i + 1] === '{') {
            i = scanTo(source, i + 2, '}');
            continue;
        }
        i++;
    }
    return i;
}

function skipRegex(source, index) {
    let i = index + 1;
    let inClass = false;
    while (i < source.length) {
        const char = source[i];
        if (char === '\\') {
            i += 2;
            continue;
        }
        if (char === '\n') {
            return i;
        }
        if (inClass) {
            inClass = char !== ']';
        } else if (char === '[') {
            inClass = true;
        } else if (char === '/') {
            i++;
            while (i < source.length && /[a-z]/i.test(source[i])) {
                i++;
            }
            return i;
        }
        i++;
    }
    return i;
}

function regexAllowedAfter(previous) {
    if (previous === '') {
        return true;
    }
    if (/^[\w$]+$/.test(previous)) {
        return REGEX_KEYWORDS.has(previous);
    }
    return !/[)\]}]/.test(previous);
}

/**
 * Scan code from `index` to the unmatched `closer` and return the index just
 * past it (or the end of the source).
 */
function scanTo(source, index, closer) {
    let depth = 0;
    let previous = '';
    let i = index;

    while (i < source.length) {
        const char = source[i];
        const next = source[i + 1];

        if (char === '"' || char === "'") {
            i = skipString(source, i);
            previous = '"';
        } else if (char === '`') {
            i = skipTemplate(source, i);
            previous = '"';
        } else if (char === '/' && next === '/') {
            const end = source.indexOf('\n', i);
            i = end === -1 ? source.length : end;
        } else if (char === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            i = end === -1 ? source.length : end + 2;
        } else if (char === '/' && regexAllowedAfter(previous)) {
            i = skipRegex(source, i);
            previous = '"';
        } else if (char === '(' || char === '[' || char === '{') {
            depth++;
            previous = char;
            i++;
        } else if (char === ')' || char === ']' || char === '}') {
            if (depth === 0 && char === closer) {
                return i + 1;
            }
            depth--;
            previous = char;
            i++;
        } else if (/[\w$]/.test(char)) {
            let end = i + 1;
            while (end < source.length && /[\w$]/.test(source[end])) {
                end++;
            }
            previous = source.slice(i, end);
            i = end;
        } else {
            if (!/\s/.test(char)) {
                previous = char;
            }
            i++;
        }
    }

    return i;
}

/**
 * The source of one module's `define(...)` call, with its trailing semicolon,
 * or null when the bundle does not define it.
 *
 * @param {string} source
 * @param {string} moduleName
 * @returns {string|null}
 */
function extractModule(source, moduleName) {
    for (const quote of ['"', "'"]) {
        const marker = `define(${quote}${moduleName}${quote}`;
        let start = source.indexOf(marker);

        while (start > 0 && /[\w$.]/.test(source[start - 1])) {
            start = source.indexOf(marker, start + 1);
        }

        if (start !== -1) {
            let end = scanTo(source, start + 'define('.length, ')');
            if (source[end] === ';') {
                end++;
            }
            return source.slice(start, end);
        }
    }

    return null;
}

/**
 * The modules a set of bundles needs from outside itself: every alias target
 * and every declared dependency that none of the bundles defines.
 *
 * @param {string[]} sources
 * @returns {{modules: string[], aliases: string[], defined: Set<string>}}
 */
function externalRequirements(sources) {
    const defined = new Set();
    const aliasTargets = new Set();
    const dependencies = new Set();

    for (const source of sources) {
        for (const name of collectDefinedModules(source)) {
            defined.add(name);
        }
        for (const { target } of collectAliases(source)) {
            aliasTargets.add(target);
        }
        for (const definition of collectDefinitions(source)) {
            definition.dependencies.forEach((dependency) => dependencies.add(dependency));
        }
    }

    const isExternal = (name) => !defined.has(name) && !defined.has(`${name}/index`);
    const aliases = [...aliasTargets].filter(isExternal).sort();
    const modules = [...new Set([...aliasTargets, ...dependencies])].filter(isExternal).sort();

    return { modules, aliases, defined };
}

module.exports = {
    collectDefinedModules,
    collectAliases,
    collectDefinitions,
    resolveDependency,
    extractModule,
    externalRequirements,
};

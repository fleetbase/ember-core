#!/usr/bin/env node
'use strict';

/**
 * Build a prebuilt engine release from a console checkout that has the engine
 * installed.
 *
 *   build-engine-release --console <dir> --engine <package> --out <dir>
 *                        [--dist <dir>] [--environment production] [--keep-maps]
 *
 * Without --dist it runs `ember build` in the console first (this takes a
 * while: 30 to 80 minutes for the full console). The release is written to
 * <out>/<package>/ with a manifest.json; see docs/runtime-engines.md.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCliArgs } = require('../lib/cli-args');
const { extractRelease } = require('../lib/engine-release');

const USAGE = 'Usage: build-engine-release --console <dir> --engine <package> --out <dir> [--dist <dir>] [--environment production] [--keep-maps]';

function main(argv) {
    const values = parseCliArgs(argv, {
        strings: ['console', 'engine', 'out', 'dist', 'environment'],
        booleans: ['keep-maps', 'help'],
        defaults: { environment: 'production', 'keep-maps': false, help: false },
    });

    if (values.error || values.help || !values.console || !values.engine || !values.out) {
        console.error(USAGE);
        return values.help ? 0 : 2;
    }

    const consoleDir = path.resolve(values.console);
    let distDir = values.dist ? path.resolve(values.dist) : null;

    if (!distDir) {
        distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-release-'));
        const ember = path.join(consoleDir, 'node_modules', '.bin', 'ember');
        console.log(`Building the console (${values.environment}) into ${distDir} …`);
        const build = spawnSync(ember, ['build', `--environment=${values.environment}`, `--output-path=${distDir}`], { cwd: consoleDir, stdio: 'inherit' });
        if (build.status !== 0) {
            console.error(`ember build failed (exit ${build.status})`);
            return 1;
        }
    }

    const manifest = extractRelease({
        consoleDir,
        distDir,
        engineName: values.engine,
        outDir: path.resolve(values.out),
        keepMaps: values['keep-maps'],
        log: (message) => console.warn(message),
    });

    const pinned = Object.entries(manifest.builtAgainst)
        .filter(([name]) => name.startsWith('@fleetbase/'))
        .map(([name, version]) => `${name}@${version}`)
        .join(', ');
    console.log(`${manifest.name}@${manifest.version} → ${path.join(values.out, manifest.name)}`);
    console.log(`  built against ${pinned}`);
    console.log(`  ${Object.keys(manifest.files).length} files, ${manifest.hostApp.modules} host-app modules, ${manifest.requires.modules.length} required host modules`);
    console.log(`  extension: ${manifest.runtime.extension === 'extension.js' ? 'standalone' : manifest.runtime.extension ? 'from the bundle' : 'none'}`);
    return 0;
}

process.exitCode = main(process.argv.slice(2));

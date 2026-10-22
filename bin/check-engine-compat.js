#!/usr/bin/env node
'use strict';

/**
 * Check a prebuilt engine release against a console build before enabling it.
 *
 *   check-engine-compat --manifest <release>/manifest.json --host <dist dir | host-modules.json>
 *                       [--policy minor|exact|modules] [--json]
 *
 * Exits 0 when compatible, 1 when not (missing modules or a pinned version
 * mismatch), 2 on usage errors.
 */

const fs = require('fs');
const { parseCliArgs } = require('../lib/cli-args');
const { checkEngineCompat, loadHost } = require('../lib/engine-compat');

const USAGE = 'Usage: check-engine-compat --manifest <manifest.json> --host <dist dir | host-modules.json> [--policy minor|exact|modules] [--json]';
const POLICIES = ['minor', 'exact', 'modules'];

function main(argv) {
    const values = parseCliArgs(argv, { strings: ['manifest', 'host', 'policy'], booleans: ['json'], defaults: { policy: 'minor', json: false } });

    if (values.error || !values.manifest || !values.host || !POLICIES.includes(values.policy)) {
        console.error(USAGE);
        return 2;
    }

    const manifest = JSON.parse(fs.readFileSync(values.manifest, 'utf8'));
    const result = checkEngineCompat(manifest, loadHost(values.host), { policy: values.policy });

    if (values.json) {
        console.log(JSON.stringify({ name: manifest.name, version: manifest.version, ...result }, null, 2));
    } else {
        console.log(`${manifest.name}@${manifest.version}: ${result.compatible ? 'compatible' : 'NOT compatible'}`);
        result.reasons.forEach((reason) => console.log(`  - ${reason}`));
        result.missing.forEach((name) => console.log(`    missing: ${name}`));
        result.versions.filter((version) => version.note).forEach((version) => console.log(`  ${version.package}: ${version.built} vs ${version.host} (${version.note})`));
    }

    return result.compatible ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));

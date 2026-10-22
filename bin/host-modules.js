#!/usr/bin/env node
'use strict';

/**
 * Write host-modules.json for a console build: the modules it defines at boot
 * and the versions of the packages engine releases are pinned to. The
 * installer checks releases against it (see bin/check-engine-compat.js).
 *
 *   host-modules --dist <dir> [--console <dir>] [--out <file>]
 *
 * --out defaults to <dist>/host-modules.json; --console (the checkout the dist
 * was built from) adds the versions.
 */

const fs = require('fs');
const path = require('path');
const { parseCliArgs } = require('../lib/cli-args');
const { buildHostModules } = require('../lib/engine-compat');

function main(argv) {
    const values = parseCliArgs(argv, { strings: ['dist', 'console', 'out'] });

    if (values.error || !values.dist) {
        console.error('Usage: host-modules --dist <dir> [--console <dir>] [--out <file>]');
        return 2;
    }

    const document = buildHostModules(path.resolve(values.dist), { consoleDir: values.console ? path.resolve(values.console) : undefined });
    const out = values.out ?? path.join(values.dist, 'host-modules.json');
    fs.writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`${document.modules.length} modules → ${out}`);
    return 0;
}

process.exitCode = main(process.argv.slice(2));

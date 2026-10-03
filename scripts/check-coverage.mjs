#!/usr/bin/env node
/**
 * Coverage gate for @fleetbase/ember-core.
 *
 * Verifies that:
 *   1. Every eligible first-party JavaScript file under addon/ is present in
 *      the generated coverage report (files with no tests may not silently
 *      drop out of the denominator).
 *   2. Every eligible file is at 100% statements, branches, functions, and lines.
 *
 * Usage: node scripts/check-coverage.mjs [--summary <path>] [--addon-dir <path>]
 * Exits non-zero when the gate fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const METRICS = ['statements', 'branches', 'functions', 'lines'];

export function listEligibleFiles(addonDir) {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(full);
            }
        }
    };
    walk(addonDir);
    return files.sort();
}

function normalize(p) {
    return p.split(path.sep).join('/');
}

// Match a coverage summary key (absolute or relative) to an eligible source file.
export function findSummaryKey(summary, file) {
    const target = normalize(path.resolve(file));
    for (const key of Object.keys(summary)) {
        if (key === 'total') continue;
        const normalizedKey = normalize(path.isAbsolute(key) ? key : path.resolve(key));
        if (normalizedKey === target || normalizedKey.endsWith('/' + normalize(file))) {
            return key;
        }
    }
    return null;
}

export function checkCoverage({ summary, eligibleFiles }) {
    const missing = [];
    const below = [];

    for (const file of eligibleFiles) {
        const key = findSummaryKey(summary, file);
        if (!key) {
            missing.push(file);
            continue;
        }
        const entry = summary[key];
        for (const metric of METRICS) {
            const summaryMetric = entry?.[metric];

            // A file with nothing to instrument is vacuously covered. Pure
            // re-export barrels are the real case: `export { default as X }
            // from './x'` compiles away, so istanbul records an empty
            // statementMap and then reports 0/0 as pct 0 — which would make
            // those files impossible to pass no matter what tests exist.
            // The file must still be PRESENT; that is checked above.
            if (summaryMetric?.total === 0) {
                continue;
            }

            if (summaryMetric?.pct !== 100) {
                below.push({ file, metric, pct: summaryMetric?.pct ?? 'n/a' });
            }
        }
    }

    return { missing, below, ok: missing.length === 0 && below.length === 0 };
}

export function main(argv = process.argv.slice(2)) {
    const summaryArg = argv.indexOf('--summary');
    const addonArg = argv.indexOf('--addon-dir');
    const summaryPath = summaryArg !== -1 ? argv[summaryArg + 1] : 'coverage/coverage-summary.json';
    const addonDir = addonArg !== -1 ? argv[addonArg + 1] : 'addon';

    if (!fs.existsSync(summaryPath)) {
        console.error(`Coverage gate: summary not found at ${summaryPath}. Run the coverage suite first.`);
        return 1;
    }

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const eligibleFiles = listEligibleFiles(addonDir);

    if (eligibleFiles.length === 0) {
        console.error(`Coverage gate: no eligible source files found under ${addonDir}.`);
        return 1;
    }

    const { missing, below, ok } = checkCoverage({ summary, eligibleFiles });

    if (missing.length > 0) {
        console.error(`Coverage gate: ${missing.length} eligible file(s) missing from the coverage report:`);
        for (const file of missing) console.error(`  - ${file}`);
    }

    if (below.length > 0) {
        console.error(`Coverage gate: ${below.length} metric(s) below 100%:`);
        for (const { file, metric, pct } of below) console.error(`  - ${file} ${metric}: ${pct}%`);
    }

    if (ok) {
        console.log(`Coverage gate: all ${eligibleFiles.length} eligible files at 100% statements/branches/functions/lines.`);
        return 0;
    }

    return 1;
}

if (normalize(path.resolve(process.argv[1] ?? '')) === normalize(new URL(import.meta.url).pathname)) {
    process.exit(main());
}

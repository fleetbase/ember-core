import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkCoverage, findSummaryKey, listEligibleFiles, main, METRICS } from './check-coverage.mjs';

function fullEntry() {
    return Object.fromEntries(METRICS.map((m) => [m, { pct: 100 }]));
}

function makeFixture({ files, summary }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covgate-'));
    const addonDir = path.join(dir, 'addon');
    for (const file of files) {
        const full = path.join(addonDir, file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, 'export default 1;\n');
    }
    const summaryPath = path.join(dir, 'coverage-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary));
    return { dir, addonDir, summaryPath };
}

test('passes when every eligible file is present at 100%', () => {
    const { addonDir } = makeFixture({ files: ['utils/a.js'], summary: {} });
    const summary = { total: fullEntry(), [path.join(addonDir, 'utils/a.js')]: fullEntry() };
    const result = checkCoverage({ summary, eligibleFiles: listEligibleFiles(addonDir) });
    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.below, []);
});

test('fails when an eligible file is absent from the report', () => {
    const { addonDir } = makeFixture({ files: ['utils/a.js', 'utils/untested.js'], summary: {} });
    const summary = { [path.join(addonDir, 'utils/a.js')]: fullEntry() };
    const result = checkCoverage({ summary, eligibleFiles: listEligibleFiles(addonDir) });
    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
    assert.match(result.missing[0], /untested\.js$/);
});

test('fails when any metric is below 100%', () => {
    const { addonDir } = makeFixture({ files: ['utils/a.js'], summary: {} });
    const entry = fullEntry();
    entry.branches = { pct: 87.5 };
    const summary = { [path.join(addonDir, 'utils/a.js')]: entry };
    const result = checkCoverage({ summary, eligibleFiles: listEligibleFiles(addonDir) });
    assert.equal(result.ok, false);
    assert.deepEqual(result.below.map(({ metric, pct }) => ({ metric, pct })), [{ metric: 'branches', pct: 87.5 }]);
});

test('treats a file with nothing to instrument as covered', () => {
    // Pure re-export barrels compile away entirely, so istanbul records an
    // empty statementMap and reports 0/0 as pct 0. Without this, such a file
    // could never pass the gate no matter what tests were written.
    const { addonDir } = makeFixture({ files: ['contracts/index.js'], summary: {} });
    const empty = { total: 0, covered: 0, skipped: 0, pct: 0 };
    const summary = {
        [path.join(addonDir, 'contracts/index.js')]: { statements: empty, branches: empty, functions: empty, lines: { ...empty } },
    };

    const result = checkCoverage({ summary, eligibleFiles: listEligibleFiles(addonDir) });

    assert.equal(result.ok, true);
    assert.deepEqual(result.below, []);
});

test('an empty file must still be present in the report', () => {
    const { addonDir } = makeFixture({ files: ['contracts/index.js'], summary: {} });

    const result = checkCoverage({ summary: {}, eligibleFiles: listEligibleFiles(addonDir) });

    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
});

test('matches relative summary keys against absolute source paths', () => {
    const { addonDir } = makeFixture({ files: ['utils/a.js'], summary: {} });
    const file = listEligibleFiles(addonDir)[0];
    const summary = { [path.join(addonDir, 'utils/a.js')]: fullEntry() };
    assert.ok(findSummaryKey(summary, file));
    assert.equal(findSummaryKey({}, file), null);
});

test('main exits nonzero when the summary file is missing', () => {
    const exitCode = main(['--summary', path.join(os.tmpdir(), 'covgate-none', 'nope.json'), '--addon-dir', 'addon']);
    assert.equal(exitCode, 1);
});

test('main exits zero on a fully covered report and nonzero on a partial one', () => {
    const { addonDir, dir } = makeFixture({ files: ['utils/a.js'], summary: {} });
    const good = { total: fullEntry(), [path.join(addonDir, 'utils/a.js')]: fullEntry() };
    const goodPath = path.join(dir, 'good.json');
    fs.writeFileSync(goodPath, JSON.stringify(good));
    assert.equal(main(['--summary', goodPath, '--addon-dir', addonDir]), 0);

    const badEntry = fullEntry();
    badEntry.lines = { pct: 99.9 };
    const bad = { total: fullEntry(), [path.join(addonDir, 'utils/a.js')]: badEntry };
    const badPath = path.join(dir, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify(bad));
    assert.equal(main(['--summary', badPath, '--addon-dir', addonDir]), 1);
});

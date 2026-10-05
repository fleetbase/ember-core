'use strict';

/**
 * ember-cli-code-coverage configuration.
 *
 * Coverage is collected for this addon's first-party JavaScript only. `excludes`
 * REPLACES the plugin's defaults rather than extending them, so the node_modules
 * and mirage entries must be repeated here — without them istanbul instruments
 * every dependency, which makes the build crawl and produces a coverage payload
 * too large for the browser to serialize and POST back.
 *
 * The 100% gate itself is enforced by scripts/check-coverage.mjs, which also
 * verifies that every eligible file under addon/ appears in the report.
 */
module.exports = {
    useBabelInstrumenter: false,
    reporters: ['lcov', 'json-summary', 'text-summary', 'json'],
    excludes: ['*/node_modules/**/*', '*/mirage/**/*', '*/tests/**/*', '*/dummy/**/*'],
};

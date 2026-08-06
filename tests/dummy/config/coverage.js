'use strict';

/**
 * ember-cli-code-coverage configuration.
 *
 * Coverage is collected for the addon's first-party JavaScript only; the
 * dummy app, tests, and vendored assets are excluded. The 100% gate itself
 * is enforced by scripts/check-coverage.mjs, which also verifies that every
 * eligible file under addon/ appears in the report.
 */
module.exports = {
    useBabelInstrumenter: false,
    reporters: ['lcov', 'json-summary', 'text-summary', 'json'],
    excludes: ['*/tests/**/*', '*/dummy/**/*'],
};

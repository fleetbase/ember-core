/**
 * Evaluates every one of this addon's modules so that source files without
 * tests still appear in the coverage report instead of dropping silently out
 * of the denominator.
 *
 * ember-cli-code-coverage ships `forceModulesToBeLoaded`, but it walks every
 * module in the build and its failure handling is not tight enough for this
 * addon: a module whose import cannot be resolved wedges the end of the run,
 * so testem never receives the completion signal and the suite hangs. This
 * version is scoped to the addon and swallows per-module failures, which is
 * safe because a module that cannot be evaluated simply stays absent from the
 * report — and scripts/check-coverage.mjs fails the build when that happens,
 * so nothing is hidden.
 *
 * Returns the names of modules that could not be evaluated.
 */
const ADDON_MODULE_PREFIX = '@fleetbase/ember-core/';

export default function forceAddonModulesToBeLoaded(prefix = ADDON_MODULE_PREFIX) {
    const failed = [];
    const entries = window.requirejs?.entries ?? {};

    for (const moduleName of Object.keys(entries)) {
        if (!moduleName.startsWith(prefix)) {
            continue;
        }

        // Templates and test-support modules are not first-party coverage targets.
        if (moduleName.includes('/test-support/') || moduleName.endsWith('/template')) {
            continue;
        }

        try {
            window.require(moduleName);
        } catch (error) {
            failed.push(moduleName);
        }
    }

    return failed;
}

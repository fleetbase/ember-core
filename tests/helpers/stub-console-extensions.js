/**
 * Provides the `@fleetbase/console/extensions` module the extension manager
 * imports from its host application.
 *
 * Unlike the config imports, this one pulls a *function* out of the console app,
 * so it cannot be redirected through ember-get-config. Without the module the
 * extension manager cannot be evaluated at all, which keeps it out of the
 * coverage report entirely. Registering an AMD stub keeps the addon testable
 * without changing production code; tests that care about loader behaviour pass
 * their own loader in.
 */
const MODULE_NAME = '@fleetbase/console/extensions';

export default function stubConsoleExtensions(getExtensionLoader = () => () => Promise.resolve(undefined)) {
    // `define` is loader.js's global in a classic build.
    // eslint-disable-next-line no-undef
    if (typeof define !== 'function' || window.requirejs?.entries?.[MODULE_NAME]) {
        return;
    }

    // eslint-disable-next-line no-undef
    define(MODULE_NAME, [], function () {
        return { getExtensionLoader };
    });
}

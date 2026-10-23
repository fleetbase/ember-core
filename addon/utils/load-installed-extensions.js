import loadExtensions from './load-extensions';
import fleetbaseApiFetch from './fleetbase-api-fetch';
import isAuthenticated from './is-authenticated';
import { runtimeSignature, toExtensionEntry } from './runtime-engines';

/**
 * The extensions this console may set up: build-time `extensions.json`
 * entries that are core, admin-configured or installed, followed by the
 * runtime engines (prebuilt releases mounted at boot, see utils/runtime-engines).
 *
 * A runtime engine counts as installed: the runtime manifest only lists
 * releases installed on this instance. When the build already has an engine,
 * its build-time entry wins and the runtime one is dropped.
 *
 * @param {Array<String>} additionalCoreEngines Engines to treat as core (admin-configured)
 * @param {Array<Object>} runtimeEngines Prepared runtime engines (getRuntimeEngines())
 * @return {Promise<Array<Object>>}
 */
export default async function loadInstalledExtensions(additionalCoreEngines = [], runtimeEngines = []) {
    const CORE_ENGINES = [
        '@fleetbase/fleetops-engine',
        '@fleetbase/storefront-engine',
        '@fleetbase/registry-bridge-engine',
        '@fleetbase/dev-engine',
        '@fleetbase/iam-engine',
        '@fleetbase/ledger-engine',
        '@fleetbase/pallet-engine',
        '@fleetbase/ai-engine',
        '@fleetbase/customer-portal-engine',
        '@fleetbase/vroom-engine',
        '@fleetbase/valhalla-engine',
        ...additionalCoreEngines,
    ];
    const INDEXED_ENGINES = await loadExtensions({ runtimeSignature: runtimeSignature(runtimeEngines) });
    // const INSTALLED_ENGINES = await fleetbaseApiFetch('get', 'engines', {}, { namespace: '~registry/v1', fallbackResponse: [] });

    let INSTALLED_ENGINES = [];
    if (isAuthenticated()) {
        INSTALLED_ENGINES = await fleetbaseApiFetch('GET', 'engines', {}, { namespace: '~registry/v1', fallbackResponse: [] });
    }

    const isInstalledEngine = (engineName) => {
        return CORE_ENGINES.includes(engineName) || INSTALLED_ENGINES.find((pkg) => pkg.name === engineName);
    };

    const indexed = INDEXED_ENGINES.filter((pkg) => {
        return isInstalledEngine(pkg.name);
    });
    const runtime = runtimeEngines.filter((engine) => !INDEXED_ENGINES.some((pkg) => pkg.name === engine.name)).map(toExtensionEntry);

    return [...indexed, ...runtime];
}

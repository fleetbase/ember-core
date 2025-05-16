import loadExtensions from './load-extensions';
import fleetbaseApiFetch from './fleetbase-api-fetch';
import isAuthenticated from './is-authenticated';

export default async function loadInstalledExtensions(additionalCoreEngines = []) {
    const CORE_ENGINES = [
        '@fleetbase/fleetops-engine',
        '@fleetbase/storefront-engine',
        '@fleetbase/registry-bridge-engine',
        '@fleetbase/dev-engine',
        '@fleetbase/iam-engine',
        ...additionalCoreEngines,
    ];
    const INDEXED_ENGINES = await loadExtensions();
    // const INSTALLED_ENGINES = await fleetbaseApiFetch('get', 'engines', {}, { namespace: '~registry/v1', fallbackResponse: [] });

    let INSTALLED_ENGINES = [];
    if (isAuthenticated()) {
        INSTALLED_ENGINES = await fleetbaseApiFetch('GET', 'engines', {}, { namespace: '~registry/v1', fallbackResponse: [] });
    }

    const isInstalledEngine = (engineName) => {
        return CORE_ENGINES.includes(engineName) || INSTALLED_ENGINES.find((pkg) => pkg.name === engineName);
    };

    return INDEXED_ENGINES.filter((pkg) => {
        return isInstalledEngine(pkg.name);
    });
}

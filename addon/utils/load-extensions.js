import { debug } from '@ember/debug';
import config from 'ember-get-config';

/**
 * Cache key for localStorage
 */
const CACHE_KEY = 'fleetbase_extensions_list';
const CACHE_VERSION_KEY = 'fleetbase_extensions_version';
const CACHE_RUNTIME_SIGNATURE_KEY = 'fleetbase_extensions_runtime_signature';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Get cached extensions from localStorage
 *
 * @param {String} runtimeSignature Signature of the runtime engine list the cache must match
 * @returns {Array|null} Cached extensions or null
 */
function getCachedExtensions(runtimeSignature) {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);

        if (!cached || !cachedVersion) {
            return null;
        }

        // Application version has changed
        if (cachedVersion !== config.APP.version) {
            debug(`[loadExtensions] Version mismatch (cached: ${cachedVersion}, current: ${config.APP.version})`);
            return null;
        }

        // A runtime engine was installed, removed or updated since the list was cached
        const cachedSignature = localStorage.getItem(CACHE_RUNTIME_SIGNATURE_KEY) ?? '';
        if (cachedSignature !== runtimeSignature) {
            debug(`[loadExtensions] Runtime engines changed (cached: "${cachedSignature}", current: "${runtimeSignature}")`);
            return null;
        }

        const cacheData = JSON.parse(cached);
        const cacheAge = Date.now() - cacheData.timestamp;

        // Check if cache is still valid (within TTL)
        if (cacheAge > CACHE_TTL) {
            debug('[loadExtensions] Cache expired');
            return null;
        }

        debug(`[loadExtensions] Using cached extensions list (age: ${Math.round(cacheAge / 1000)}s)`);
        return cacheData.extensions;
    } catch (e) {
        debug(`[loadExtensions] Failed to read cache: ${e.message}`);
        return null;
    }
}

/**
 * Save extensions to localStorage cache
 *
 * @param {Array} extensions Extensions array
 * @param {String} runtimeSignature Signature of the runtime engine list at the time
 */
function setCachedExtensions(extensions, runtimeSignature) {
    try {
        const cacheData = {
            extensions,
            timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        localStorage.setItem(CACHE_VERSION_KEY, config.APP.version);
        localStorage.setItem(CACHE_RUNTIME_SIGNATURE_KEY, runtimeSignature);
        debug('[loadExtensions] Extensions list cached to localStorage');
    } catch (e) {
        debug(`[loadExtensions] Failed to cache extensions: ${e.message}`);
    }
}

/**
 * Clear cached extensions
 *
 * @export
 */
export function clearExtensionsCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_VERSION_KEY);
        localStorage.removeItem(CACHE_RUNTIME_SIGNATURE_KEY);
        debug('[loadExtensions] Cache cleared');
    } catch (e) {
        debug(`[loadExtensions] Failed to clear cache: ${e.message}`);
    }
}

/**
 * Load extensions list with localStorage caching
 *
 * Strategy:
 * 1. Check localStorage cache first (instant, no HTTP request)
 * 2. If cache hit and valid, use it immediately
 * 3. If cache miss, fetch from server and cache the result
 * 4. Cache is valid for 1 hour, for one app version and one runtime engine list
 *
 * @export
 * @param {Object} [options]
 * @param {String} [options.runtimeSignature] Signature of the runtime engine list (see utils/runtime-engines);
 *   a cache written under another signature is discarded
 * @returns {Promise<Array>} Extensions array
 */
export default async function loadExtensions({ runtimeSignature = '' } = {}) {
    const isProduction = config?.environment === 'production';
    if (isProduction) {
        // Try cache first only in production
        const cachedExtensions = getCachedExtensions(runtimeSignature);
        if (cachedExtensions) {
            return Promise.resolve(cachedExtensions);
        }
    }

    // Cache miss - fetch from server
    return new Promise((resolve, reject) => {
        const startTime = performance.now();

        return fetch('/extensions.json', {
            cache: 'default', // Use browser cache if available
        })
            .then((resp) => resp.json())
            .then((extensions) => {
                const endTime = performance.now();
                debug(`[loadExtensions] Fetched from server in ${(endTime - startTime).toFixed(2)}ms`);

                // Cache the result
                setCachedExtensions(extensions, runtimeSignature);
                resolve(extensions);
            })
            .catch(reject);
    });
}

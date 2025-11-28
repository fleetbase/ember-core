import { debug } from '@ember/debug';

/**
 * Cache key for localStorage
 */
const CACHE_KEY = 'fleetbase_extensions_list';
const CACHE_VERSION_KEY = 'fleetbase_extensions_version';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Get cached extensions from localStorage
 * 
 * @returns {Array|null} Cached extensions or null
 */
function getCachedExtensions() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
        
        if (!cached || !cachedVersion) {
            return null;
        }

        const cacheData = JSON.parse(cached);
        const cacheAge = Date.now() - cacheData.timestamp;

        // Check if cache is still valid (within TTL)
        if (cacheAge > CACHE_TTL) {
            debug('[load-extensions] Cache expired');
            return null;
        }

        debug(`[load-extensions] Using cached extensions list (age: ${Math.round(cacheAge / 1000)}s)`);
        return cacheData.extensions;
    } catch (e) {
        debug(`[load-extensions] Failed to read cache: ${e.message}`);
        return null;
    }
}

/**
 * Save extensions to localStorage cache
 * 
 * @param {Array} extensions Extensions array
 */
function setCachedExtensions(extensions) {
    try {
        const cacheData = {
            extensions,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        localStorage.setItem(CACHE_VERSION_KEY, '1');
        debug('[load-extensions] Extensions list cached to localStorage');
    } catch (e) {
        debug(`[load-extensions] Failed to cache extensions: ${e.message}`);
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
        debug('[load-extensions] Cache cleared');
    } catch (e) {
        debug(`[load-extensions] Failed to clear cache: ${e.message}`);
    }
}

/**
 * Load extensions list with localStorage caching
 * 
 * Strategy:
 * 1. Check localStorage cache first (instant, no HTTP request)
 * 2. If cache hit and valid, use it immediately
 * 3. If cache miss, fetch from server and cache the result
 * 4. Cache is valid for 1 hour
 * 
 * @export
 * @returns {Promise<Array>} Extensions array
 */
export default async function loadExtensions() {
    // Try cache first
    const cachedExtensions = getCachedExtensions();
    if (cachedExtensions) {
        return Promise.resolve(cachedExtensions);
    }

    // Cache miss - fetch from server
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        
        return fetch('/extensions.json', {
            cache: 'default' // Use browser cache if available
        })
            .then((resp) => resp.json())
            .then((extensions) => {
                const endTime = performance.now();
                debug(`[load-extensions] Fetched from server in ${(endTime - startTime).toFixed(2)}ms`);
                
                // Cache the result
                setCachedExtensions(extensions);
                resolve(extensions);
            })
            .catch(reject);
    });
}

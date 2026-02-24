/**
 * Lookup user's IP address and geolocation information using geoiplookup.io
 *
 * This method calls the geoiplookup.io API directly from the browser to get
 * accurate user location data, avoiding the issue of server-side IP lookup
 * returning the server's location instead of the user's location.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Request timeout in milliseconds (default: 5000)
 * @param {boolean} options.cache - Whether to cache the result (default: true)
 * @returns {Promise<Object>} User's IP and geolocation data
 *
 * @example
 * const whois = await lookupUserIp();
 * console.log(whois.city); // "New York"
 * console.log(whois.country_code); // "US"
 */
export default async function lookupUserIp(options = {}) {
    const { timeout = 5000, cache = true } = options;

    // Check cache first if enabled
    if (cache) {
        const cached = getCachedWhois();
        if (cached) {
            return cached;
        }
    }

    // Try multiple APIs with fallback
    const apis = [
        {
            url: 'https://json.geoiplookup.io/',
            normalize: normalizeGeoIPLookup,
        },
        {
            url: 'https://ipapi.co/json/',
            normalize: normalizeIPApi,
        },
    ];

    for (const api of apis) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(api.url, {
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                },
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[lookupUserIp] ${api.url} returned ${response.status}`);
                continue;
            }

            const data = await response.json();
            const normalized = api.normalize(data);

            // Cache the result if enabled
            if (cache) {
                cacheWhois(normalized);
            }

            return normalized;
        } catch (error) {
            console.warn(`[lookupUserIp] ${api.url} failed:`, error.message);
            // Continue to next API
        }
    }

    // All APIs failed, return fallback
    console.error('[lookupUserIp] All IP lookup APIs failed, using fallback data');
    return getFallbackWhois();
}

/**
 * Normalize geoiplookup.io response to match Fleetbase whois format
 */
function normalizeGeoIPLookup(data) {
    return {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country_code: data.country_code,
        country_name: data.country_name,
        continent_code: data.continent_code,
        continent_name: data.continent_name,
        latitude: data.latitude,
        longitude: data.longitude,
        postal_code: data.postal_code,
        timezone: data.timezone_name,
        currency: {
            code: data.currency_code,
            name: data.currency_name,
        },
        languages: [
            {
                code: data.language_code,
                name: data.language_name,
            },
        ],
        isp: data.isp,
        org: data.org,
        asn: data.asn,
        connection_type: data.connection_type,
        // Metadata
        _source: 'geoiplookup.io',
        _timestamp: Date.now(),
    };
}

/**
 * Normalize ipapi.co response to match Fleetbase whois format
 */
function normalizeIPApi(data) {
    return {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country_code: data.country_code,
        country_name: data.country_name,
        continent_code: data.continent_code,
        continent_name: null,
        latitude: data.latitude,
        longitude: data.longitude,
        postal_code: data.postal,
        timezone: data.timezone,
        currency: {
            code: data.currency,
            name: data.currency_name,
        },
        languages: data.languages ? data.languages.split(',').map((lang) => ({ code: lang.trim(), name: lang.trim() })) : [],
        isp: data.org,
        org: data.org,
        asn: data.asn,
        connection_type: null,
        // Metadata
        _source: 'ipapi.co',
        _timestamp: Date.now(),
    };
}

/**
 * Get cached whois data from localStorage
 */
function getCachedWhois() {
    try {
        const cached = localStorage.getItem('fleetbase:whois');
        if (!cached) {
            return null;
        }

        const data = JSON.parse(cached);
        const age = Date.now() - data._timestamp;
        const maxAge = 60 * 60 * 1000; // 1 hour

        if (age > maxAge) {
            localStorage.removeItem('fleetbase:whois');
            return null;
        }

        return data;
    } catch (error) {
        console.error('[getCachedWhois] Error reading cache:', error);
        return null;
    }
}

/**
 * Cache whois data to localStorage
 */
function cacheWhois(data) {
    try {
        localStorage.setItem('fleetbase:whois', JSON.stringify(data));
    } catch (error) {
        console.error('[cacheWhois] Error writing cache:', error);
    }
}

/**
 * Get fallback whois data when all APIs fail
 */
function getFallbackWhois() {
    // Try to get browser language and timezone as fallback
    const browserLang = navigator.language || 'en-US';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
        ip: null,
        city: null,
        region: null,
        country_code: null,
        country_name: null,
        continent_code: null,
        continent_name: null,
        latitude: null,
        longitude: null,
        postal_code: null,
        timezone: timezone,
        currency: {
            code: null,
            name: null,
        },
        languages: [
            {
                code: browserLang.split('-')[0],
                name: browserLang,
            },
        ],
        isp: null,
        org: null,
        asn: null,
        connection_type: null,
        _source: 'fallback',
        _timestamp: Date.now(),
    };
}

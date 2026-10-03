import config from 'ember-get-config';
import { isBlank } from '@ember/utils';

const isDevelopment = ['local', 'development'].includes(config.environment);

export function queryString(params) {
    return Object.keys(params)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
}

export function extractHostAndPort(url) {
    try {
        /* istanbul ignore next -- `new URL` always defines `port` (empty string for a default port), so the `= null` default is never applied */
        const { hostname: host, port = null } = new URL(url);
        return { host, port };
    } catch (error) {
        return { host: null, port: null };
    }
}

export default function consoleUrl(path = '', queryParams = {}, subdomain = null, host = null) {
    if (subdomain === null || host === null) {
        const { hostname, host: currentHost } = window.location;
        if (subdomain === null) {
            const parts = hostname.split('.');
            /* istanbul ignore next -- the test server is served from a single-label host, so the multi-label arm cannot be reached from a test */
            subdomain = parts.length > 2 ? parts[0] : null;
        }
        if (host === null) {
            // extractHostAndPort parses with `new URL`, which needs a protocol;
            // window.location.host is only "hostname:port" and would not parse.
            host = `${window.location.protocol}//${currentHost}`;
        }
    }

    const { host: parsedHost, port } = extractHostAndPort(host);
    /* istanbul ignore next -- isDevelopment is computed once at import time, and the suite always imports under environment 'test' */
    const protocol = isDevelopment ? 'http://' : 'https://';
    const urlParams = !isBlank(queryParams) ? queryString(queryParams) : '';
    const portSegment = port ? `:${port}` : '';
    const pathSegment = path.startsWith('/') ? path : `/${path}`;

    return `${protocol}${subdomain ? subdomain + '.' : ''}${parsedHost}${portSegment}${pathSegment}${urlParams ? '?' + urlParams : ''}`;
}

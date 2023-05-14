import config from '@fleetbase/console/config/environment';
import { isBlank } from '@ember/utils';

const isDevelopment = ['local', 'development'].includes(config.environment);
const isProduction = ['production'].includes(config.environment);

function queryString(params) {
    return Object.keys(params)
        .map((key) => `${key}=${params[key]}`)
        .join('&');
}

function extractHostAndPort(url) {
    try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname;
        const port = parsedUrl.port;

        return {
            host: host,
            port: port || null,
        };
    } catch (error) {
        console.error('Invalid URL:', error);
        return null;
    }
}

export default function consoleUrl(path = '', queryParams = {}, subdomain = 'console', host = 'fleetbase.io') {
    let parsedHost = extractHostAndPort(host);
    let url = isDevelopment ? 'http://' : 'https://';

    if (subdomain) {
        url += subdomain + '.';
    }

    let urlParams = !isBlank(queryParams) ? queryString(queryParams) : '';

    if (!isProduction && !isDevelopment) {
        url += `${config.environment}.`;
    }

    url += parsedHost.host;

    if (parsedHost.port) {
        url+= `:${parsedHost.port}`;
    }

    url += `/${path}`;

    if (urlParams) {
        url += `?${urlParams}`;
    }

    return url;
}

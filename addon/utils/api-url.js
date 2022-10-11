import consoleUrl from './console-url';
import config from '@fleetbase/console/config/environment';

export default function apiUrl(
  path,
  queryParams = {},
  subdomain = 'api',
  host = 'fleetbase.io'
) {
  if (['local', 'development'].includes(config.environment)) {
    subdomain = 'v2api';
    host = 'fleetbase.engineering';
  }

  return consoleUrl(path, queryParams, subdomain, host);
}

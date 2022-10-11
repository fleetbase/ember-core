import config from '@fleetbase/console/config/environment';
import { isBlank } from '@ember/utils';

const queryString = (params) =>
  Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .join('&');

export default function consoleUrl(
  path = '',
  queryParams = {},
  subdomain = 'console',
  host = 'fleetbase.io'
) {
  let url = `https://${subdomain}.`;
  let urlParams = !isBlank(queryParams) ? queryString(queryParams) : '';

  if (['qa', 'staging'].includes(config.environment)) {
    url += `${config.environment}.`;
  }

  if (
    host === 'fleetbase.io' &&
    ['local', 'development'].includes(config.environment)
  ) {
    url += 'fleetbase.engineering';
  } else {
    url += host;
  }

  url += `/${path}`;

  if (urlParams) {
    url += `?${urlParams}`;
  }

  return url;
}

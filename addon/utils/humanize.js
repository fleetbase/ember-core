import { humanize as humanizeString } from 'ember-cli-string-helpers/helpers/humanize';

export default function humanize(string) {
  return humanizeString([string]);
}

import { capitalize, decamelize } from '@ember/string';
import { humanize } from 'ember-cli-string-helpers/helpers/humanize';
import { typeOf } from '@ember/utils';

/**
 * Provides the @fleetbase/ember-ui modules this addon imports.
 *
 * addon/services/crud.js imports smart-humanize from @fleetbase/ember-ui. That
 * package cannot be a dependency of this one, because ember-ui already depends
 * on @fleetbase/ember-core — declaring it would be circular. In an application
 * both are siblings and the module resolves; in the dummy app nothing provides
 * it, so the crud service cannot even be loaded without this stub.
 *
 * The implementation below is a faithful copy of ember-ui's, so any test that
 * does assert on humanized output is asserting real behaviour rather than a
 * convenient simplification.
 *
 * Worth noting for the maintainers: ember-core already ships addon/utils/humanize.js
 * with the same acronym list, so this cross-package reach is for a near-duplicate
 * of something core already owns.
 */
const MODULE_NAME = '@fleetbase/ember-ui/utils/smart-humanize';

const UPPERCASE = [
    'api',
    'vat',
    'id',
    'uuid',
    'sku',
    'ean',
    'upc',
    'erp',
    'tms',
    'wms',
    'ltl',
    'ftl',
    'lcl',
    'fcl',
    'rfid',
    'jot',
    'roi',
    'eta',
    'pod',
    'asn',
    'oem',
    'ddp',
    'fob',
    'gsm',
    'etd',
    'ect',
    'aws',
    'gcp',
];

export function smartHumanize(string) {
    if (typeOf(string) !== 'string') {
        return string;
    }

    return humanize([decamelize(string)])
        .toLowerCase()
        .split(' ')
        .map((word) => (UPPERCASE.includes(word) ? word.toUpperCase() : capitalize(word)))
        .join(' ');
}

export default function stubEmberUi() {
    // `define` is loader.js's global in a classic build.
    // eslint-disable-next-line no-undef
    if (typeof define !== 'function' || window.requirejs?.entries?.[MODULE_NAME]) {
        return;
    }

    // eslint-disable-next-line no-undef
    define(MODULE_NAME, [], function () {
        return { default: smartHumanize };
    });
}

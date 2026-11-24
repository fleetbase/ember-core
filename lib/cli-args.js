'use strict';

/**
 * Parse `--name value` and `--flag` arguments. Kept here rather than using
 * util.parseArgs, which needs Node 18.3.
 *
 * @param {string[]} argv
 * @param {{strings?: string[], booleans?: string[], defaults?: Object}} spec
 * @returns {Object} the values, or `{ error }` for an unknown or valueless option
 */
function parseCliArgs(argv, { strings = [], booleans = [], defaults = {} } = {}) {
    const values = { ...defaults };

    for (let i = 0; i < argv.length; i++) {
        const name = argv[i].replace(/^--/, '');

        if (booleans.includes(name)) {
            values[name] = true;
        } else if (strings.includes(name) && i + 1 < argv.length) {
            values[name] = argv[++i];
        } else {
            return { error: `unexpected argument ${argv[i]}` };
        }
    }

    return values;
}

module.exports = { parseCliArgs };

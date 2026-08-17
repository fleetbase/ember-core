import { getOwner } from '@ember/application';
import { assert } from '@ember/debug';

/**
 * Normalize a raw payload and push it into the store as a record.
 *
 * The owner has to be supplied by the caller. The previous implementation built
 * a bare `CoreObject` and called `getOwner(this)` on it, which is always
 * `undefined` — nothing had set an owner on it — so every call threw on the
 * following line. Taking the owner as an argument is the smallest change that
 * makes the function work at all.
 *
 * @param {Object} record The raw payload to normalize
 * @param {String} modelName The model to normalize it as
 * @param {Object} context Anything with an owner — a service, component or
 *                         route — or the owner itself
 * @returns {Model} The pushed record
 *
 * @example
 * // from a service or component
 * toModel(payload, 'order', this);
 */
const toModel = (record, modelName, context) => {
    const owner = getOwner(context) ?? context;

    assert('toModel() needs an owner: pass `this` from a service, component or route.', owner && typeof owner.lookup === 'function');

    const store = owner.lookup('service:store');
    const normalized = store.normalize(modelName, record);

    return store.push(normalized);
};

export default toModel;

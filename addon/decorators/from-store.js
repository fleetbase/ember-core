import { decoratorWithRequiredParams } from '@ember-decorators/utils/decorator';
import { assert } from '@ember/debug';

export default function fromStore(modelName, query = {}) {
    assert('The first argument of the @fromStore decorator must be a string', typeof modelName === 'string');
    assert('The second argument of the @fromStore decorator must be an object', typeof query === 'object');

    return decoratorWithRequiredParams(function (target, key, desc, params) {
        const { getOwner } = params[0]; // Get the 'getOwner' function from the component
        const store = getOwner(this).lookup('service:store'); // Get the Ember Data store

        // Perform the query and set the result to the property
        store.query(modelName, query).then((result) => {
            this.set(key, result);
        });
    });
}

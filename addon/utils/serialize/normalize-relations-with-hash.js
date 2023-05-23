import { get, setProperties } from '@ember/object';
import { isBlank } from '@ember/utils';

export default function serializeNormalizeRelationsWithinHash(hash, primaryKey = 'uuid') {
    if (typeof hash !== 'object') {
        return hash;
    }

    for (let attr in hash) {
        if (typeof attr === 'string' && attr.includes('_uuid')) {
            // console.log(attr, hash[attr]);
            if (typeof hash[attr] === 'object' && !isBlank(hash[attr])) {
                // the relation has loaded back into `_uuid` - change this to the proper `uuid` string value and set the relationship
                const relation = hash[attr];
                const id = get(relation, primaryKey);
                const relationAttr = attr.replace('_uuid', '');

                // console.log(`normalizing relation ${relationAttr} from ${attr}`);
                // console.log(relationAttr, relation);
                // console.log(attr, id);

                setProperties(hash, {
                    [relationAttr]: relation,
                    [attr]: id,
                });
            }
        }
    }

    return hash;
}

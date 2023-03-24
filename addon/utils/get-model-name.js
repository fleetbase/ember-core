import { get } from '@ember/object';
import isModel from './is-model';
import { getWithDefault } from '@ember/object';

export default function getModelName(model) {
    if (isModel(model)) {
        return get(model, '_internalModel.modelName') === undefined ? 'resource' : get(model, '_internalModel.modelName');
    }

    return 'resource';
}

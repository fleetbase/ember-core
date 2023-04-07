import { get } from '@ember/object';
import isModel from './is-model';
import { getWithDefault } from '@ember/object';

export default function getModelName(model, fallback = null) {
    if (isModel(model)) {
        return get(model, 'constructor.modelName') ?? get(model, '_internalModel.modelName') ?? fallback;
    }

    return fallback;
}

import isModel from './is-model';

export default function serializeModel(model) {
    if (isModel(model)) {
        if (typeof model.toJSON === 'function') {
            return model.toJSON();
        }

        if (typeof model.serialize === 'function') {
            return model.serialize();
        }
    }

    return model;
}

import serializeModel from './serialize-model';
import { isArray } from '@ember/array';

export default function serializeModelArray(array) {
    return isArray(array) ? array.map((item) => serializeModel(item)) : array;
}

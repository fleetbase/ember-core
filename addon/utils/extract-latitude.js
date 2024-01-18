/* eslint-disable no-unused-vars */
import Terraformer from 'terraformer';
import { isArray } from '@ember/array';

export default function extractLatitude(position) {
    let [longitude, latitude] = [0, 0];

    if (!position) {
        return 0;
    }

    if (position instanceof Terraformer.Point || isArray(position.coordinates)) {
        [longitude, latitude] = position.coordinates;

        return latitude;
    }

    if (typeof position === 'object') {
        let latitude = position['lat'] || position['latitude'] || position['x'];

        return latitude;
    }

    return latitude;
}

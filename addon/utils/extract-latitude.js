/* eslint-disable no-unused-vars */
import extractCoordinates from './extract-coordinates';
import Terraformer from 'terraformer';
import { isArray } from '@ember/array';

export default function extractLatitude(position) {
    let latitude, longitude;

    if (!position) {
        return 0;
    }

    if (position instanceof Terraformer.Point || isArray(position.coordinates)) {
        [latitude, longitude] = extractCoordinates(position.coordinates);

        return latitude;
    }

    if (typeof position === 'object') {
        let latitude = position['lat'] || position['latitude'] || position['x'];

        return latitude;
    }

    [latitude, longitude] = extractCoordinates(position);

    return latitude;
}

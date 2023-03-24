/* eslint-disable no-unused-vars */
import extractCoordinates from './extract-coordinates';
import Terraformer from 'terraformer';
import { isArray } from '@ember/array';

export default function extractLongitude(position) {
    let latitude, longitude;

    if (!position) {
        return 0;
    }

    if (position instanceof Terraformer.Point || isArray(position.coordinates)) {
        [latitude, longitude] = extractCoordinates(position.coordinates);

        return longitude;
    }

    if (typeof position === 'object') {
        let longitude = position['lng'] || position['longitude'] || position['lon'] || position['y'];

        return longitude;
    }

    [latitude, longitude] = extractCoordinates(position);

    return longitude;
}

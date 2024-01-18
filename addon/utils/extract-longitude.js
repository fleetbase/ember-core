/* eslint-disable no-unused-vars */
import Terraformer from 'terraformer';
import { isArray } from '@ember/array';

export default function extractLongitude(position) {
    let latitude, longitude;

    if (!position) {
        return 0;
    }

    if (position instanceof Terraformer.Point || isArray(position.coordinates)) {
        [longitude, latitude] = position.coordinates;

        return longitude;
    }

    if (typeof position === 'object') {
        let longitude = position['lng'] || position['longitude'] || position['lon'] || position['y'];

        return longitude;
    }

    return longitude;
}

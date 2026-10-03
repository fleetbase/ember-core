/**
 * Swap a point's axes: GeoJSON's `[longitude, latitude]` to Leaflet's `[latitude, longitude]`, and back.
 * Accepts a coordinate pair or a GeoJSON Point; anything else comes back as given.
 *
 * @param {Array|Object} point
 * @returns {Array|Object}
 */
export default function reversePoint(point) {
    if (Array.isArray(point) && point.length >= 2) {
        return [point[1], point[0], ...point.slice(2)];
    }

    if (point?.type === 'Point' && Array.isArray(point.coordinates)) {
        return { ...point, coordinates: reversePoint(point.coordinates) };
    }

    return point;
}

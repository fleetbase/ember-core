import reversePoint from './reverse-point';

/**
 * Leaflet `[latitude, longitude]` points from GeoJSON `[longitude, latitude]` coordinates.
 *
 * @param {Array<Array>} coordinates
 * @returns {Array<Array>}
 */
export default function leafletPointsFromCoordinates(coordinates) {
    return Array.isArray(coordinates) ? coordinates.map(reversePoint) : [];
}

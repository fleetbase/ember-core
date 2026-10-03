import haversine from './haversine';

export default function findClosestWaypoint(latitude, longitude, waypoints = []) {
    const distances = [];

    for (let i = 0; i < waypoints.length; i++) {
        const waypoint = waypoints[i];
        const distance = haversine({ latitude, longitude }, waypoint.place.get('latitudelongitude'));

        distances.push({ distance, waypoint });
    }

    distances.sort((a, b) => a.distance - b.distance);

    return distances[0]?.waypoint;
}

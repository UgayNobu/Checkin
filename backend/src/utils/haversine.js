// Great-circle distance in metres between two { lat, lng } points.
const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
const isWithinGeofence = (point, centre, radius) => haversineMeters(point, centre) <= radius;

module.exports = { haversineMeters, isWithinGeofence };

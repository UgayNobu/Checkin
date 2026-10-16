// Polygon geofence maths. Points are { lat, lng }; polygon rings are GeoJSON [lng, lat] arrays.
// A building is ~100 m across, so a flat (equirectangular) projection around the point is accurate to centimetres.

const M_PER_DEG_LAT = 111320;
const toRad = (d) => (d * Math.PI) / 180;

/** Ray casting: is the point inside this ring? */
function insideRing({ lat, lng }, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance in metres from the point to the ring's outline. */
function distanceToRingMeters(p, ring) {
  const mLng = M_PER_DEG_LAT * Math.cos(toRad(p.lat));
  const xy = ([lng, lat]) => [(lng - p.lng) * mLng, (lat - p.lat) * M_PER_DEG_LAT]; // point becomes (0,0)
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = xy(ring[i]), [bx, by] = xy(ring[i + 1]);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/**
 * Where is the point relative to a building?
 * @returns {{ inside: boolean, outsideBy: number }} outsideBy = metres outside the nearest wall (0 when inside)
 */
function locateInBuilding(point, building) {
  if (building.polygons.some((ring) => insideRing(point, ring))) return { inside: true, outsideBy: 0 };
  const outsideBy = Math.min(...building.polygons.map((ring) => distanceToRingMeters(point, ring)));
  return { inside: false, outsideBy };
}

module.exports = { insideRing, distanceToRingMeters, locateInBuilding };

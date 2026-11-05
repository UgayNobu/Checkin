// Is the phone inside the class's area? Same maths as the server (backend/src/utils/geofence.js),
// so the student sees "inside / outside" BEFORE pressing Check In. The server still decides.
// Polygon rings are GeoJSON [lng, lat] arrays.

const M_PER_DEG_LAT = 111320;
const WEAK_M = 50; // same as geo.js: worse than this is shown in yellow
const toRad = (d) => (d * Math.PI) / 180;

/** Ray casting: is the point inside this ring? */
export function insideRing({ lat, lng }, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance in metres from the point to the ring's outline. */
function distanceToRing(p, ring) {
  const mLng = M_PER_DEG_LAT * Math.cos(toRad(p.lat));
  const xy = ([lng, lat]) => [(lng - p.lng) * mLng, (lat - p.lat) * M_PER_DEG_LAT];
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = xy(ring[i]), [bx, by] = xy(ring[i + 1]);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Metres between two points (haversine). */
export function metresBetween(a, b) {
  const R = 6371000, dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Metres outside a building's walls (0 when inside). */
export function outsideBuilding(point, polygons) {
  if (polygons.some((ring) => insideRing(point, ring))) return 0;
  return Math.min(...polygons.map((ring) => distanceToRing(point, ring)));
}

/**
 * Where the student is compared with the class's area, as a status line.
 * @param fix       fused GPS { lat, lng, accuracy }
 * @param location  the class's location from /attendance/live ({ mode, name, edge, centre? })
 * @param polygons  the building's outline (building classes only)
 * @returns { level: 'good' | 'weak' | 'bad', text } or null when it can't be worked out
 */
export function placeStatus(fix, location, polygons) {
  if (!fix || !location) return null;
  const building = location.mode === 'building';
  let dist;
  if (building) {
    if (!polygons?.length) return null;
    dist = outsideBuilding(fix, polygons);
  } else {
    if (!location.centre) return null;
    dist = metresBetween(fix, location.centre);
  }
  const limit = location.edge ?? (building ? 10 : 40);
  const acc = Math.round(fix.accuracy), d = Math.round(dist);
  const place = building ? `the ${location.name}` : 'the workshop area';

  if (dist <= limit) {
    if (fix.accuracy > WEAK_M) {
      return { level: 'weak', text: `You seem to be inside ${place}, but the location is only ±${acc} m. Wait a few seconds near a window or door so it can improve.` };
    }
    return building
      ? { level: 'good', text: `You are inside ${place} (location ±${acc} m)` }
      : { level: 'good', text: `You are within ${Math.round(limit)} m of your tutor (location ±${acc} m)` };
  }
  // Outside, but the GPS error margin could still put them inside: the server will flag it
  if (dist - fix.accuracy <= limit) {
    return {
      level: 'weak',
      text: building
        ? `You may be just outside ${place} (about ${d} m, location ±${acc} m). Move further inside, or your check-in may be flagged.`
        : `You may be outside ${place} (about ${d} m from your tutor, location ±${acc} m). Move closer, or your check-in may be flagged.`,
    };
  }
  // Clearly outside: the server will refuse the check-in
  return {
    level: 'bad',
    text: building
      ? `You are about ${d} m outside ${place}. Go inside to your class, then check in.`
      : `You are about ${d} m from your tutor. Move within ${Math.round(limit)} m, then check in.`,
  };
}

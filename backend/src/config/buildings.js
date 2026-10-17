// ─────────────────────────────────────────────────────────────
// CST campus buildings used as attendance geofences.
// Outlines drawn on geojson.io (coordinates are [longitude, latitude], GeoJSON order).
//
// How a building session is stored WITHOUT a database change:
//   attendance_codes.latitude / longitude = the building's `anchor` (a fixed point inside it)
//   attendance_codes.geofence_radius      = edge tolerance in metres (GPS wobble allowed outside the walls)
// At check-in, buildingFromCode() matches the stored point back to its building.
// A workshop session stores the tutor's own GPS + the radius they typed, exactly as before.
// ─────────────────────────────────────────────────────────────

// Metres a student may be OUTSIDE the outline and still count (phone GPS drifts indoors).
// Keep it small: the IT and LT buildings almost touch.
const EDGE_TOLERANCE_M = 10;

const BUILDINGS = [
  {
    key: 'IT',
    name: 'IT Building',
    rooms: [
      ...['01', '02', '03', '04', '05', '06'].map((n) => ({ name: `IT ${n}` })),
      { name: 'ITL 01', label: 'Programming Lab I' },
      { name: 'ITL 02', label: 'Programming Lab II' },
      { name: 'ITL 03', label: 'BYOD Lab' },
      { name: 'ITL 04', label: 'Electrical Simulation' },
      { name: 'ITL 05', label: 'Programming Lab III' },
      { name: 'ITL 06', label: 'Data Science Lab' },
      { name: 'ITL 07', label: 'OOS Lab' },
      { name: 'ITL 08', label: 'Software Lab' },
      { name: 'ITL 09', label: 'Database Lab' },
      { name: 'ITL 10', label: 'NLP Lab' },
      { name: 'ITL 11', label: 'Network Lab' },
    ],
    anchor: { lat: 26.849435, lng: 89.391926 },
    polygons: [[
      [89.391637, 26.849685], [89.391666, 26.849613], [89.39163, 26.849379], [89.391649, 26.849374],
      [89.391661, 26.84922], [89.391799, 26.849327], [89.39183, 26.849262], [89.392098, 26.849357],
      [89.392076, 26.849404], [89.392136, 26.849423], [89.392036, 26.849622], [89.391849, 26.849545],
      [89.391854, 26.849616], [89.39182, 26.849628], [89.391784, 26.849731], [89.391637, 26.849685],
    ]],
  },
  {
    key: 'LT',
    name: 'LT Building',
    rooms: [{ name: 'LT 01' }, { name: 'LT 02' }],
    anchor: { lat: 26.849801, lng: 89.391903 },
    polygons: [[
      [89.391755, 26.849926], [89.391819, 26.849635], [89.392051, 26.849682], [89.391988, 26.849958], [89.391755, 26.849926],
    ]],
  },
  {
    key: 'ACAD',
    name: 'Academic Building',
    rooms: Array.from({ length: 13 }, (_, i) => ({ name: `CR ${i + 1}` })),
    anchor: { lat: 26.849467, lng: 89.392848 },
    polygons: [[
      [89.392119, 26.8498], [89.392374, 26.849231], [89.392933, 26.849437], [89.39287, 26.849552],
      [89.392771, 26.84952], [89.392784, 26.849464], [89.39244, 26.849352], [89.392229, 26.849836], [89.392119, 26.8498],
    ]],
  },
  {
    key: 'ARCH',
    name: 'Architecture Building',
    // The timetable lists these rooms as "Library Building" (first and second floor)
    rooms: [
      ...['14', '15', '16', '17', '18'].map((n) => ({ name: `CR ${n}` })),
      ...['01', '02', '03', '04', '05'].map((n) => ({ name: `Drawing Studio ${n}` })),
    ],
    anchor: { lat: 26.849592, lng: 89.394145 },
    polygons: [[
      [89.393902, 26.849643], [89.393981, 26.84952], [89.39398, 26.849482], [89.39405, 26.84937],
      [89.394488, 26.849596], [89.394422, 26.849675], [89.394385, 26.849669], [89.394739, 26.849845],
      [89.394652, 26.849963], [89.394367, 26.849824], [89.394334, 26.849873], [89.394262, 26.849839],
      [89.39427, 26.849828], [89.393902, 26.849643],
    ]],
  },
];

const BUILDING_KEYS = BUILDINGS.map((b) => b.key);

// ── Rooms → building
// Room names are typed in different ways ("ITL06", "itl-6", "IT 05", "CR3", "LT-01", "Drawing Studio 2", "DS1"),
// so each is reduced to PREFIX|number before comparing. Lab names ("Data Science Lab") also match.
const PREFIX = /^(ITL|IT|CR|LT|DS|DRAWINGSTUDIO|STUDIO)(\d+)$/;
const squash = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function roomKey(text) {
  const m = squash(text).match(PREFIX);
  if (!m) return null;
  const prefix = m[1] === 'DRAWINGSTUDIO' || m[1] === 'STUDIO' ? 'DS' : m[1];
  return `${prefix}|${Number(m[2])}`;
}
const ROOM_INDEX = new Map();
for (const b of BUILDINGS) {
  for (const r of b.rooms) {
    ROOM_INDEX.set(roomKey(r.name), b);
    if (r.label) ROOM_INDEX.set(squash(r.label), b);
  }
}
/** The building a room is in ("ITL 06" → IT Building), or null if the room isn't in the list. */
const buildingForRoom = (room) => ROOM_INDEX.get(roomKey(room)) || ROOM_INDEX.get(squash(room)) || null;
const buildingByKey = (key) => BUILDINGS.find((b) => b.key === key) || null;

// Same tiny epsilon both ways, in case the float comes back from Postgres with a rounding difference.
const same = (a, b) => Math.abs(a - b) < 1e-9;
/** The building a stored attendance code points at, or null for a workshop (tutor-GPS) code. */
const buildingFromCode = (row) =>
  BUILDINGS.find((b) => same(b.anchor.lat, row.latitude) && same(b.anchor.lng, row.longitude)) || null;

/** What the frontend needs to draw the cards (no secrets in here). */
const publicBuildings = () => BUILDINGS.map(({ key, name, polygons, rooms }) => ({ key, name, polygons, rooms }));

module.exports = { BUILDINGS, BUILDING_KEYS, EDGE_TOLERANCE_M, buildingByKey, buildingForRoom, buildingFromCode, publicBuildings };

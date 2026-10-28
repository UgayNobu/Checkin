const { insideRing, locateInBuilding } = require('../../src/utils/geofence');
const { buildingByKey, EDGE_TOLERANCE_M } = require('../../src/config/buildings');

// A simple 10 x 10 square in GeoJSON [lng, lat] order
const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const IT = buildingByKey('IT');
const LT = buildingByKey('LT');

describe('insideRing', () => {
  test('TC-UNIT-06: a point in the middle of a square is inside', () => {
    expect(insideRing({ lat: 5, lng: 5 }, square)).toBe(true);
  });

  test('TC-UNIT-07: points above and to the left of the square are outside', () => {
    expect(insideRing({ lat: 15, lng: 5 }, square)).toBe(false);
    expect(insideRing({ lat: 5, lng: -1 }, square)).toBe(false);
  });

  test('TC-UNIT-08: bad input - an empty ring contains nothing', () => {
    expect(insideRing({ lat: 5, lng: 5 }, [])).toBe(false);
  });
});

describe('locateInBuilding', () => {
  test('TC-UNIT-09: the IT building anchor is inside the IT building with outsideBy 0', () => {
    expect(locateInBuilding(IT.anchor, IT)).toEqual({ inside: true, outsideBy: 0 });
  });

  test('TC-UNIT-10: a point ~200 m north of the anchor is outside with a positive outsideBy', () => {
    const far = { lat: IT.anchor.lat + 0.0018, lng: IT.anchor.lng };
    const r = locateInBuilding(far, IT);
    expect(r.inside).toBe(false);
    expect(r.outsideBy).toBeGreaterThan(150); // north wall is ~32 m from the anchor
    expect(r.outsideBy).toBeLessThan(200);
  });

  test('TC-UNIT-11: edge case - a student in the LT building (next door) is not counted in IT', () => {
    const r = locateInBuilding(LT.anchor, IT);
    expect(r.inside).toBe(false);
    expect(r.outsideBy).toBeGreaterThan(EDGE_TOLERANCE_M);
  });
});

import { isValidCoordinate, calculateBounds, normalizeRouteCoordinates } from './route-coordinate-utils';

describe('isValidCoordinate', () => {
  it('should accept valid lng/lat', () => {
    expect(isValidCoordinate(19.94, 50.06)).toBe(true);
  });

  it('should accept coordinates at the extremes', () => {
    expect(isValidCoordinate(-180, -90)).toBe(true);
    expect(isValidCoordinate(180, 90)).toBe(true);
  });

  it('should reject lng below -180', () => {
    expect(isValidCoordinate(-181, 0)).toBe(false);
  });

  it('should reject lng above 180', () => {
    expect(isValidCoordinate(181, 0)).toBe(false);
  });

  it('should reject lat below -90', () => {
    expect(isValidCoordinate(0, -91)).toBe(false);
  });

  it('should reject lat above 90', () => {
    expect(isValidCoordinate(0, 91)).toBe(false);
  });

  it('should reject Infinity values', () => {
    expect(isValidCoordinate(Infinity, 0)).toBe(false);
    expect(isValidCoordinate(0, Infinity)).toBe(false);
  });

  it('should reject NaN values', () => {
    expect(isValidCoordinate(NaN, 0)).toBe(false);
    expect(isValidCoordinate(0, NaN)).toBe(false);
  });
});

describe('calculateBounds', () => {
  it('should calculate bounds from coordinates', () => {
    const coords: [number, number][] = [
      [19.94, 50.06],
      [19.96, 50.08],
      [19.95, 50.07],
    ];

    const bounds = calculateBounds(coords);

    expect(bounds).toEqual({
      west: 19.94,
      south: 50.06,
      east: 19.96,
      north: 50.08,
    });
  });

  it('should handle a single coordinate pair', () => {
    const coords: [number, number][] = [[19.94, 50.06]];

    expect(calculateBounds(coords)).toBeUndefined();
  });

  it('should handle negative coordinates', () => {
    const coords: [number, number][] = [
      [-122.42, 37.77],
      [-122.40, 37.78],
    ];

    const bounds = calculateBounds(coords);

    expect(bounds).toEqual({
      west: -122.42,
      south: 37.77,
      east: -122.40,
      north: 37.78,
    });
  });

  it('should handle crossing the prime meridian', () => {
    const coords: [number, number][] = [
      [-5, 50],
      [5, 52],
    ];

    const bounds = calculateBounds(coords);

    expect(bounds).toEqual({
      west: -5,
      south: 50,
      east: 5,
      north: 52,
    });
  });
});

describe('normalizeRouteCoordinates', () => {
  it('should return valid result with coordinates and bounds', () => {
    const raw: [number, number][] = [
      [19.94, 50.06],
      [19.95, 50.07],
      [19.96, 50.08],
    ];

    const result = normalizeRouteCoordinates(raw);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coordinates).toEqual(raw);
      expect(result.bounds).toEqual({ west: 19.94, south: 50.06, east: 19.96, north: 50.08 });
    }
  });

  it('should return empty_route when raw coordinates are empty', () => {
    const result = normalizeRouteCoordinates([]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('empty_route');
    }
  });

  it('should return invalid_coordinates when fewer than 2 valid points remain after filtering', () => {
    const raw: [number, number][] = [[19.94, 50.06]];

    const result = normalizeRouteCoordinates(raw);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_coordinates');
    }
  });

  it('should skip invalid coordinate pairs and keep valid ones', () => {
    const raw: [number, number][] = [
      [19.94, 50.06],
      [181, 50.07],
      [19.96, 50.08],
      [0, 91],
    ];

    const result = normalizeRouteCoordinates(raw);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coordinates).toHaveLength(2);
      expect(result.coordinates[0]).toEqual([19.94, 50.06]);
      expect(result.coordinates[1]).toEqual([19.96, 50.08]);
    }
  });

  it('should return invalid_coordinates when all points are filtered out', () => {
    const raw: [number, number][] = [
      [181, 50.07],
      [0, 91],
    ];

    const result = normalizeRouteCoordinates(raw);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_coordinates');
    }
  });

  it('should handle NaN coordinates by filtering them out', () => {
    const raw: [number, number][] = [
      [19.94, 50.06],
      [NaN, 50.07],
      [19.96, NaN],
      [19.98, 50.10],
    ];

    const result = normalizeRouteCoordinates(raw);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coordinates).toHaveLength(2);
    }
  });

  it('should handle Infinity coordinates by filtering them out', () => {
    const raw: [number, number][] = [
      [Infinity, 50.06],
      [19.94, 50.06],
      [19.95, 50.07],
    ];

    const result = normalizeRouteCoordinates(raw);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coordinates).toHaveLength(2);
      expect(result.coordinates[0]).toEqual([19.94, 50.06]);
      expect(result.coordinates[1]).toEqual([19.95, 50.07]);
    }
  });
});

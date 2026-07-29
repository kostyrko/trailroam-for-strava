import { buildSpeedSegments, haversineDistance } from './speed-segments';

describe('buildSpeedSegments', () => {
  const coords: [number, number][] = [
    [19.94, 50.06],
    [19.95, 50.07],
    [19.96, 50.08],
    [19.97, 50.09],
  ];

  it('should return an empty list for fewer than 2 coordinates', () => {
    expect(buildSpeedSegments([[19.94, 50.06]], 3)).toEqual([]);
  });

  // This is the contract the activity detail panel's fallback relies on: a track whose average
  // speed is 0 (e.g. an imported GPX without usable timestamps) yields no speed segments, so the
  // renderer falls back to a single solid-colour line instead of speed-coloured segments.
  it('should return an empty list when average speed is 0', () => {
    expect(buildSpeedSegments(coords, 0)).toEqual([]);
  });

  it('should return an empty list when average speed is missing', () => {
    expect(buildSpeedSegments(coords, 0)).toEqual([]);
  });

  it('should build speed-coloured segments for valid coordinates and speed', () => {
    const segs = buildSpeedSegments(coords, 3);
    expect(segs.length).toBeGreaterThan(0);
    for (const seg of segs) {
      expect(seg.geometry.type).toBe('LineString');
      expect(seg.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(seg.properties?.['speedRatio']).toBeGreaterThanOrEqual(0.1);
    }
  });
});

describe('haversineDistance', () => {
  it('should return 0 for identical points', () => {
    expect(haversineDistance(19.94, 50.06, 19.94, 50.06)).toBe(0);
  });

  it('should return a positive distance for distinct points', () => {
    expect(haversineDistance(19.94, 50.06, 19.95, 50.07)).toBeGreaterThan(0);
  });
});

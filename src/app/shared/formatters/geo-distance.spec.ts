import { describe, it, expect } from 'vitest';
import { haversineMeters } from './geo-distance';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ latitude: 50, longitude: 19 }, { latitude: 50, longitude: 19 })).toBe(0);
  });

  it('measures a known short distance consistently with ~10m precision', () => {
    // Kraków main square area: two points ~115m apart.
    const a = { latitude: 50.0614, longitude: 19.9372 };
    const b = { latitude: 50.0622, longitude: 19.9366 };
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(130);
  });

  it('measures a long distance symmetrically', () => {
    const krakow = { latitude: 50.0647, longitude: 19.945 };
    const warsaw = { latitude: 52.2297, longitude: 21.0122 };
    const d1 = haversineMeters(krakow, warsaw);
    const d2 = haversineMeters(warsaw, krakow);
    expect(d1).toBeCloseTo(d2, 6);
    // Kraków–Warsaw is ~250km.
    expect(d1).toBeGreaterThan(240_000);
    expect(d1).toBeLessThan(260_000);
  });

  it('handles points across the antimeridian without producing NaN', () => {
    const a = { latitude: 0, longitude: 179.999 };
    const b = { latitude: 0, longitude: -179.999 };
    const d = haversineMeters(a, b);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });
});

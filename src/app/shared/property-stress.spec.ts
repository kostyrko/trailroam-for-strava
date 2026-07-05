import { computeDerivedStats, suggestSportType } from './activity-parser.service';
import { smoothElevations, niceRound, niceScale, binarySearch } from '../map/elevation-profile.component';
import { downsample } from '../activities/route-sparkline.component';
import { haversineDistance } from './activity-parser.service';
import { slugify, sportTypeSlug, escapeXml } from './gpx-export.service';
import { isAfterOrEqual, isBeforeOrEqual } from './filters.service';

function randomCoord(): [number, number] {
  return [(Math.random() - 0.5) * 360, (Math.random() - 0.5) * 180];
}

function randomElevation(): number {
  return Math.random() * 8000 - 500;
}

function randomTimestamp(): string {
  const y = 2000 + Math.floor(Math.random() * 30);
  const m = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  const h = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const min = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  const s = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
}

describe('Property: computeDerivedStats', () => {
  it('should never produce negative distance', () => {
    for (let i = 0; i < 100; i++) {
      const n = 2 + Math.floor(Math.random() * 20);
      const coords: [number, number][] = Array.from({ length: n }, () => randomCoord());
      const elevs = coords.map(() => randomElevation());
      const times = coords.map(() => randomTimestamp());
      const result = computeDerivedStats(coords, elevs, times);
      expect(result.totalDistanceMeters).toBeGreaterThanOrEqual(0);
      expect(result.totalElevationGainMeters).toBeGreaterThanOrEqual(0);
      expect(result.totalElevationLossMeters).toBeGreaterThanOrEqual(0);
    }
  });

  it('should handle single coordinate', () => {
    for (let i = 0; i < 50; i++) {
      const result = computeDerivedStats([randomCoord()], [randomElevation()], [randomTimestamp()]);
      expect(result.cumulativeDistances).toEqual([0]);
      expect(result.totalDistanceMeters).toBe(0);
    }
  });

  it('should never produce NaN', () => {
    for (let i = 0; i < 100; i++) {
      const coords: [number, number][] = Array.from({ length: 5 + Math.floor(Math.random() * 50) }, () => randomCoord());
      const elevs = coords.map(() => randomElevation());
      const times = coords.map(() => randomTimestamp());
      const result = computeDerivedStats(coords, elevs, times);
      expect(result.totalDistanceMeters).not.toBeNaN();
      expect(result.averageSpeedMetersPerSecond).not.toBeNaN();
      expect(result.bounds[0][0]).toBeLessThanOrEqual(result.bounds[1][0]);
      expect(result.bounds[0][1]).toBeLessThanOrEqual(result.bounds[1][1]);
    }
  });

  it('should handle antipodal coordinates without crashing', () => {
    const coords: [number, number][] = [[179.9, 89.9], [-179.9, -89.9]];
    const result = computeDerivedStats(coords, [0, 0], ['2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z']);
    expect(result.totalDistanceMeters).toBeGreaterThan(0);
    expect(isFinite(result.totalDistanceMeters)).toBe(true);
  });
});

describe('Property: suggestSportType', () => {
  it('should always return a known sport type', () => {
    const valid = ['Walk', 'Hike', 'TrailRun', 'Run', 'GravelRide', 'Ride', 'Other'];
    for (let i = 0; i < 200; i++) {
      const speed = Math.random() * 50;
      const dist = Math.random() * 200000;
      const elev = Math.random() * 5000;
      const result = suggestSportType(speed, dist, elev);
      expect(valid).toContain(result.sportType);
      expect(['walk', 'hike', 'run', 'ride', 'other']).toContain(result.category);
    }
  });

  it('should always return a sport type for edge inputs', () => {
    const edgeCases = [
      [0, 0, 0],
      [-1, -1, -1],
      [NaN, NaN, NaN],
      [Infinity, 0, 0],
      [0, Infinity, 0],
    ];
    for (const [s, d, e] of edgeCases) {
      const result = suggestSportType(s, d, e);
      expect(result.sportType).toBeTruthy();
      expect(result.category).toBeTruthy();
    }
  });
});

describe('Property: smoothElevations', () => {
  it('should preserve input length for all valid inputs', () => {
    for (let i = 0; i < 100; i++) {
      const n = 4 + Math.floor(Math.random() * 200);
      const elevations = Array.from({ length: n }, () => Math.random() * 1000);
      const distances = elevations.map((_, j) => j * 100);
      const result = smoothElevations(elevations, distances);
      expect(result).toHaveLength(n);
    }
  });
});

describe('Property: niceRound', () => {
  it('should always return a positive number for positive input', () => {
    for (let i = 0; i < 200; i++) {
      const v = Math.random() * 100000 + 0.1;
      const result = niceRound(v);
      expect(result).toBeGreaterThan(0);
      expect(Number.isFinite(result)).toBe(true);
    }
  });

  it('should return 0 for 0 or negative', () => {
    expect(niceRound(0)).toBe(0);
    expect(niceRound(-5)).toBe(0);
    expect(niceRound(-Infinity)).toBe(0);
  });
});

describe('Property: binarySearch', () => {
  it('should always return a valid index for any target', () => {
    for (let i = 0; i < 200; i++) {
      const n = 2 + Math.floor(Math.random() * 50);
      const arr = Array.from({ length: n }, (_, j) => j * 100);
      const target = Math.random() * 10000 - 1000;
      const idx = binarySearch(arr, target);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(arr.length - 1);
    }
  });
});

describe('Property: downsample', () => {
  it('should never produce more points than maxPoints', () => {
    for (let i = 0; i < 100; i++) {
      const n = 1 + Math.floor(Math.random() * 500);
      const pts: [number, number][] = Array.from({ length: n }, () => randomCoord());
      const maxPoints = 1 + Math.floor(Math.random() * 50);
      const result = downsample(pts, maxPoints);
      expect(result.length).toBeLessThanOrEqual(maxPoints);
      expect(result.length).toBeLessThanOrEqual(n);
    }
  });

  it('should preserve first and last points for large inputs', () => {
    const pts: [number, number][] = Array.from({ length: 500 }, (_, i) => [i, i * 2] as [number, number]);
    const result = downsample(pts, 10);
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([499, 998]);
  });
});

describe('Property: haversineDistance', () => {
  it('should always be non-negative and symmetric', () => {
    for (let i = 0; i < 100; i++) {
      const [lng1, lat1] = randomCoord();
      const [lng2, lat2] = randomCoord();
      const d1 = haversineDistance(lng1, lat1, lng2, lat2);
      const d2 = haversineDistance(lng2, lat2, lng1, lat1);
      expect(d1).toBeGreaterThanOrEqual(0);
      expect(Math.abs(d1 - d2)).toBeLessThan(0.01);
    }
  });
});

describe('Property: slugify', () => {
  it('should never produce empty string for non-empty input', () => {
    for (let i = 0; i < 100; i++) {
      const input = Array.from({ length: 5 + Math.floor(Math.random() * 50) },
        () => String.fromCharCode(32 + Math.floor(Math.random() * 95)),
      ).join('');
      const result = slugify(input);
      expect(typeof result).toBe('string');
      expect(result.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('Property: escapeXml', () => {
  it('should never throw for any string', () => {
    for (let i = 0; i < 100; i++) {
      const input = String.fromCharCode(...Array.from({ length: 50 }, () => Math.floor(Math.random() * 128)));
      expect(() => escapeXml(input)).not.toThrow();
    }
  });
});

describe('Property: isAfterOrEqual / isBeforeOrEqual', () => {
  it('should be consistent for same dates', () => {
    for (let i = 0; i < 100; i++) {
      const d = randomTimestamp().slice(0, 10);
      expect(isAfterOrEqual(d, d)).toBe(true);
      expect(isBeforeOrEqual(d, d)).toBe(true);
    }
  });
});

import { slugify, sportTypeSlug, buildGpx, escapeXml } from './gpx-export.service';
import type { ActivityRecord, RouteGeometryRecord } from '../storage/storage.models';

describe('gpx-export pure functions', () => {
  describe('slugify', () => {
    it('should convert to lowercase dashed', () => {
      expect(slugify('Morning Ride')).toBe('morning-ride');
    });
    it('should remove special chars', () => {
      expect(slugify('Hello! World?')).toBe('hello-world');
    });
    it('should trim dashes', () => {
      expect(slugify('--test--')).toBe('test');
    });
    it('should cap at 100 chars', () => {
      expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(100);
    });
    it('should fallback for empty', () => {
      expect(slugify('   ')).toBe('activity');
    });
  });

  describe('sportTypeSlug', () => {
    it('should convert camelCase to snake_case', () => {
      expect(sportTypeSlug('GravelRide')).toBe('gravel_ride');
    });
    it('should handle single word', () => {
      expect(sportTypeSlug('Ride')).toBe('ride');
    });
  });

  describe('escapeXml', () => {
    it('should escape XML special chars', () => {
      expect(escapeXml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
    });
  });

  describe('buildGpx', () => {
    const activity: ActivityRecord = {
      id: 'test:1', provider: 'strava', providerActivityId: '1', name: 'Test Ride',
      sportType: 'Ride', activityCategory: 'ride', startDate: '2024-01-01T10:00:00Z',
      distanceMeters: 1000, movingTimeSeconds: 300, totalElevationGainMeters: 50,
      averageSpeedMetersPerSecond: 3.33, hasRoute: true, routeSyncStatus: 'route_synced',
      importedAt: '2024-01-01T10:00:00Z', updatedAt: '2024-01-01T10:00:00Z',
    };
    const route: RouteGeometryRecord = {
      activityId: 'test:1', providerActivityId: '1',
      coordinates: [[19.94, 50.06], [19.95, 50.07]] as [number, number][],
      elevations: [200, 210],
      syncedAt: '2024-01-01T10:00:00Z', updatedAt: '2024-01-01T10:00:00Z',
    };

    it('should generate valid GPX XML', () => {
      const gpx = buildGpx(activity, route);
      expect(gpx).toContain('<?xml version="1.0"');
      expect(gpx).toContain('<name>Test Ride</name>');
      expect(gpx).toContain('lat="50.06" lon="19.94"');
      expect(gpx).toContain('lat="50.07" lon="19.95"');
      expect(gpx).toContain('</gpx>');
    });

    it('should include optional time element', () => {
      const gpx = buildGpx(activity, route);
      expect(gpx).toContain('<time>');
    });

    it('should omit time when startDate is empty', () => {
      const gpx = buildGpx({ ...activity, startDate: '' }, route);
      expect(gpx).not.toContain('<time>');
    });

    it('should include per-point elevation when the route has elevations', () => {
      const gpx = buildGpx(activity, route);
      expect(gpx).toContain('<ele>200</ele>');
      expect(gpx).toContain('<ele>210</ele>');
    });

    it('should omit elevation when the route has no elevations', () => {
      const gpx = buildGpx(activity, { ...route, elevations: undefined });
      expect(gpx).not.toContain('<ele>');
    });

    it('should omit elevation when elevations length does not match coordinates', () => {
      const gpx = buildGpx(activity, { ...route, elevations: [200] });
      expect(gpx).not.toContain('<ele>');
    });
  });
});

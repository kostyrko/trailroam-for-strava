import { TestBed } from '@angular/core/testing';
import { StravaRouteNormalizer } from './strava-route-normalizer';
import type { RouteFetchResult } from './strava-session.service';

describe('StravaRouteNormalizer', () => {
  let normalizer: StravaRouteNormalizer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    normalizer = TestBed.inject(StravaRouteNormalizer);
  });

  function successfulFetch(latlng: [number, number][]): RouteFetchResult {
    return { success: true, latlng };
  }

  it('should normalize valid coordinates into an ActivityRouteRecord', () => {
    const result = normalizer.normalize('strava:100', '100', successfulFetch([
      [19.94, 50.06],
      [19.95, 50.07],
      [19.96, 50.08],
    ]));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.route.activityId).toBe('strava:100');
      expect(result.route.providerActivityId).toBe('100');
      expect(result.route.coordinates).toHaveLength(3);
      expect(result.route.pointCount).toBe(3);
      expect(result.route.bounds).toEqual({ west: 19.94, south: 50.06, east: 19.96, north: 50.08 });
      expect(result.route.syncedAt).toBeTruthy();
      expect(result.route.updatedAt).toBeTruthy();
    }
  });

  it('should return NO_GPS_ROUTE when fetch failed with that code', () => {
    const fetchResult: RouteFetchResult = { success: false, errorCode: 'NO_GPS_ROUTE' };

    const result = normalizer.normalize('strava:100', '100', fetchResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('NO_GPS_ROUTE');
    }
  });

  it('should pass through ACTIVITY_ROUTE_FETCH_FAILED from fetch failure', () => {
    const fetchResult: RouteFetchResult = { success: false, errorCode: 'ACTIVITY_ROUTE_FETCH_FAILED' };

    const result = normalizer.normalize('strava:100', '100', fetchResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('ACTIVITY_ROUTE_FETCH_FAILED');
    }
  });

  it('should return EMPTY_ROUTE when coordinates array is empty', () => {
    const result = normalizer.normalize('strava:100', '100', successfulFetch([]));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('EMPTY_ROUTE');
    }
  });

  it('should return INVALID_COORDINATES when fewer than 2 valid points', () => {
    const result = normalizer.normalize('strava:100', '100', successfulFetch([
      [19.94, 50.06],
    ]));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('INVALID_COORDINATES');
    }
  });

  it('should return INVALID_COORDINATES when all points are out of bounds', () => {
    const result = normalizer.normalize('strava:100', '100', successfulFetch([
      [181, 50.07],
      [0, 91],
    ]));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('INVALID_COORDINATES');
    }
  });

  it('should filter invalid points and produce a valid route from the rest', () => {
    const result = normalizer.normalize('strava:100', '100', successfulFetch([
      [19.94, 50.06],
      [181, 50.07],
      [19.96, 50.08],
    ]));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.route.coordinates).toHaveLength(2);
      expect(result.route.pointCount).toBe(2);
    }
  });

  it('should pass through STRAVA_LOGIN_REQUIRED from fetch failure', () => {
    const fetchResult: RouteFetchResult = { success: false, errorCode: 'STRAVA_LOGIN_REQUIRED' };

    const result = normalizer.normalize('strava:100', '100', fetchResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('STRAVA_LOGIN_REQUIRED');
    }
  });
});

import { Injectable } from '@angular/core';
import type { ActivityRecord, ActivityRouteRecord, RouteGeometryRecord } from '../storage/storage.models';
import type { RouteFetchResult } from './strava-session.service';
import { normalizeRouteCoordinates, simplifyCoordinates } from './route-coordinate-utils';
import { computeStreamStats } from '../shared/stream-stats';

export type RouteNormalizationResult =
  | { success: true; route: ActivityRouteRecord; geometry?: RouteGeometryRecord; stats?: Partial<Pick<ActivityRecord, 'averageHeartrateBpm' | 'maxHeartrateBpm' | 'minHeartrateBpm' | 'maxSpeedMetersPerSecond' | 'averageTemperatureCelsius'>> }
  | { success: false; errorCode: 'NO_GPS_ROUTE' | 'EMPTY_ROUTE' | 'INVALID_COORDINATES' };

@Injectable({
  providedIn: 'root',
})
export class StravaRouteNormalizer {
  normalize(
    activityId: string,
    providerActivityId: string,
    fetchResult: RouteFetchResult,
  ): RouteNormalizationResult {
    if (!fetchResult.success) {
      return { success: false, errorCode: fetchResult.errorCode as 'NO_GPS_ROUTE' };
    }

    const normalized = normalizeRouteCoordinates(fetchResult.coordinates);

    if (!normalized.valid) {
      const errorCode = normalized.reason === 'empty_route' ? 'EMPTY_ROUTE' : 'INVALID_COORDINATES';
      return { success: false, errorCode };
    }

    const now = new Date().toISOString();
    const simplified = simplifyCoordinates(normalized.coordinates);

    const route: ActivityRouteRecord = {
      activityId,
      providerActivityId,
      simplifiedCoordinates: simplified,
      simplifiedPointCount: simplified.length,
      pointCount: normalized.coordinates.length,
      bounds: normalized.bounds,
      syncedAt: now,
      updatedAt: now,
    };

    const geometry: RouteGeometryRecord = {
      activityId,
      providerActivityId,
      coordinates: normalized.coordinates,
      elevations: fetchResult.elevations,
      cumulativeDistances: fetchResult.cumulativeDistances,
      syncedAt: now,
      updatedAt: now,
    };

    // Performance aggregates (HR avg/max/min, max speed, avg temperature) from the sensor
    // streams requested alongside the route. Absent sensor data yields no fields, so merging
    // never overwrites a previously-stored value.
    const stats = computeStreamStats({
      heartrate: fetchResult.heartrate,
      velocitySmooth: fetchResult.velocitySmooth,
      temp: fetchResult.temp,
      timeStream: fetchResult.timeStream,
    });

    return { success: true, route, geometry, stats };
  }
}

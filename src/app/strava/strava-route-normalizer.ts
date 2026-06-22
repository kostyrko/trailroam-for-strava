import { Injectable } from '@angular/core';
import type { ActivityRouteRecord, RouteGeometryRecord } from '../storage/storage.models';
import type { RouteFetchResult } from './strava-session.service';
import { normalizeRouteCoordinates, simplifyCoordinates } from './route-coordinate-utils';

export type RouteNormalizationResult =
  | { success: true; route: ActivityRouteRecord; geometry?: RouteGeometryRecord }
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

    return { success: true, route, geometry };
  }
}

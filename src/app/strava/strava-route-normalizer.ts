import { Injectable } from '@angular/core';
import type { ActivityRouteRecord } from '../storage/storage.models';
import type { RouteFetchResult } from './strava-session.service';
import { normalizeRouteCoordinates } from './route-coordinate-utils';

export type RouteNormalizationResult =
  | { success: true; route: ActivityRouteRecord }
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

    const normalized = normalizeRouteCoordinates(fetchResult.latlng);

    if (!normalized.valid) {
      const errorCode = normalized.reason === 'empty_route' ? 'EMPTY_ROUTE' : 'INVALID_COORDINATES';
      return { success: false, errorCode };
    }

    const now = new Date().toISOString();

    const route: ActivityRouteRecord = {
      activityId,
      providerActivityId,
      coordinates: normalized.coordinates,
      pointCount: normalized.coordinates.length,
      bounds: normalized.bounds,
      syncedAt: now,
      updatedAt: now,
    };

    return { success: true, route };
  }
}

import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import type { RouteSyncStatus } from './storage.models';
import { StravaRouteNormalizer } from '../strava/strava-route-normalizer';
import type { RouteFetchResult } from '../strava/strava-session.service';
import type { UpsertRouteResult } from './repositories/activity-routes.repository';

export interface SyncRouteResult {
  routeStored: boolean;
  routeSyncStatus: RouteSyncStatus;
  route: UpsertRouteResult | null;
}

export interface RouteSyncBatchItem {
  activityId: string;
  providerActivityId: string;
  fetchResult: RouteFetchResult;
  /** Reason for skipping before the fetch, if any. */
  skipReason?: string;
}

export interface RouteSyncBatchResult {
  synced: number;
  noRoute: number;
  emptyRoute: number;
  invalidCoordinates: number;
  rateLimited: number;
  failed: number;
  skipped: number;
  total: number;
  results: SyncRouteResult[];
}

@Injectable({
  providedIn: 'root',
})
export class RouteSyncService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly routeNormalizer = inject(StravaRouteNormalizer);

  async syncRoute(
    activityId: string,
    providerActivityId: string,
    fetchResult: RouteFetchResult,
  ): Promise<SyncRouteResult> {
    if (!fetchResult.success && fetchResult.errorCode === 'STRAVA_RATE_LIMITED') {
      await this.repositories.activities.updateRouteSyncStatus(
        activityId,
        false,
        'rate_limited',
      );
      return { routeStored: false, routeSyncStatus: 'rate_limited', route: null };
    }

    const normalized = this.routeNormalizer.normalize(activityId, providerActivityId, fetchResult);

    if (!normalized.success) {
      const routeSyncStatus = mapNormalizationErrorToRouteSyncStatus(normalized.errorCode);
      await this.repositories.activities.updateRouteSyncStatus(
        activityId,
        false,
        routeSyncStatus,
      );
      return { routeStored: false, routeSyncStatus, route: null };
    }

    const routeResult = await this.repositories.activityRoutes.upsert(normalized.route);

    await this.repositories.activities.updateRouteSyncStatus(
      activityId,
      true,
      'route_synced',
    );

    return { routeStored: true, routeSyncStatus: 'route_synced', route: routeResult };
  }

  async syncRoutesBatch(items: RouteSyncBatchItem[]): Promise<RouteSyncBatchResult> {
    const results: SyncRouteResult[] = [];
    const counters: RouteSyncBatchResult = {
      synced: 0, noRoute: 0, emptyRoute: 0, invalidCoordinates: 0, rateLimited: 0, failed: 0, skipped: 0, total: items.length, results: [],
    };

    for (const item of items) {
      if (item.skipReason) {
        counters.skipped++;
        continue;
      }

      try {
        const result = await this.syncRoute(item.activityId, item.providerActivityId, item.fetchResult);
        results.push(result);

        switch (result.routeSyncStatus) {
          case 'route_synced':
            counters.synced++;
            break;
          case 'no_route':
            counters.noRoute++;
            break;
          case 'empty_route':
            counters.emptyRoute++;
            break;
          case 'invalid_coordinates':
            counters.invalidCoordinates++;
            break;
          case 'route_failed':
            counters.failed++;
            break;
          case 'skipped':
            counters.skipped++;
            break;
          case 'rate_limited':
            counters.rateLimited++;
            break;
        }
      } catch {
        counters.failed++;
      }
    }

    counters.results = results;
    return counters;
  }
}

function mapNormalizationErrorToRouteSyncStatus(errorCode: string): RouteSyncStatus {
  switch (errorCode) {
    case 'NO_GPS_ROUTE':
      return 'no_route';
    case 'EMPTY_ROUTE':
      return 'empty_route';
    case 'INVALID_COORDINATES':
      return 'invalid_coordinates';
    default:
      return 'route_failed';
  }
}

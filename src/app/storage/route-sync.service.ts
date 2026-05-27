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

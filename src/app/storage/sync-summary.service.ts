import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import type { SyncNewResult } from '../sync/sync-engine.service';

export interface SyncSummary {
  importedCount: number;
  updatedCount: number;
  routesSyncedCount: number;
  skippedCount: number;
  skippedReason: string;
  failedCount: number;
  rateLimitedCount: number;
  status: 'completed' | 'failed' | 'cancelled' | null;
  completedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  hasResults: boolean;
  totalActivities: number;
  activitiesWithRoutes: number;
  activitiesWithoutRoutes: number;
}

@Injectable({
  providedIn: 'root',
})
export class SyncSummaryService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  async updateFromResult(result: SyncNewResult): Promise<void> {
    const now = new Date().toISOString();
    await this.repositories.syncState.put({
      id: 'default',
      status: 'completed',
      completedAt: now,
      lastSuccessfulSyncAt: now,
      lastActivityFetchAt: now,
      importedCount: result.importedCount,
      updatedCount: result.updatedCount,
      routesSyncedCount: result.routesSyncedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      rateLimitedCount: result.rateLimitedCount,
      startedAt: now,
      lastErrorCode: result.errorMessage ? 'SYNC_ERROR' : undefined,
      lastErrorMessage: result.errorMessage,
    });
  }

  async getSummary(): Promise<SyncSummary> {
    const syncState = await this.repositories.syncState.get();

    if (!syncState) {
      return emptySummary();
    }

    const [totalActivities, activitiesWithRoutes] = await Promise.all([
      this.repositories.activities.count(),
      this.repositories.activityRoutes.count(),
    ]);
    const activitiesWithoutRoutes = totalActivities - activitiesWithRoutes;

    const status = syncState.status === 'idle' || syncState.status === 'checking_session' || syncState.status === 'fetching_activities' || syncState.status === 'fetching_routes' ? null : syncState.status;

    return {
      importedCount: syncState.importedCount ?? 0,
      updatedCount: syncState.updatedCount ?? 0,
      routesSyncedCount: syncState.routesSyncedCount ?? 0,
      skippedCount: syncState.skippedCount ?? 0,
      skippedReason: syncState.lastErrorCode === 'NO_GPS_ROUTE' ? 'No GPS data available' : 'No GPS data available',
      failedCount: syncState.failedCount ?? 0,
      rateLimitedCount: syncState.rateLimitedCount ?? 0,
      status,
      completedAt: syncState.completedAt ?? null,
      lastSuccessfulSyncAt: syncState.lastSuccessfulSyncAt ?? null,
      lastErrorCode: syncState.lastErrorCode ?? null,
      lastErrorMessage: syncState.lastErrorMessage ?? null,
      hasResults: (syncState.importedCount ?? 0) > 0 || (syncState.updatedCount ?? 0) > 0 || (syncState.routesSyncedCount ?? 0) > 0 || (syncState.skippedCount ?? 0) > 0 || (syncState.failedCount ?? 0) > 0 || (syncState.rateLimitedCount ?? 0) > 0,
      totalActivities,
      activitiesWithRoutes,
      activitiesWithoutRoutes,
    };
  }
}

function emptySummary(): SyncSummary {
  return {
    importedCount: 0,
    updatedCount: 0,
    routesSyncedCount: 0,
    skippedCount: 0,
    skippedReason: '',
    failedCount: 0,
    rateLimitedCount: 0,
    status: null,
    completedAt: null,
    lastSuccessfulSyncAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    hasResults: false,
    totalActivities: 0,
    activitiesWithRoutes: 0,
    activitiesWithoutRoutes: 0,
  };
}

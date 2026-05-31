import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';

export interface SyncSummary {
  importedCount: number;
  updatedCount: number;
  routesSyncedCount: number;
  skippedCount: number;
  failedCount: number;
  rateLimitedCount: number;
  status: 'completed' | 'failed' | 'cancelled' | null;
  completedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  hasResults: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class SyncSummaryService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  async getSummary(): Promise<SyncSummary> {
    const syncState = await this.repositories.syncState.get();

    if (!syncState) {
      return emptySummary();
    }

    const status = syncState.status === 'idle' || syncState.status === 'checking_session' || syncState.status === 'fetching_activities' || syncState.status === 'fetching_routes' ? null : syncState.status;

    return {
      importedCount: syncState.importedCount ?? 0,
      updatedCount: syncState.updatedCount ?? 0,
      routesSyncedCount: syncState.routesSyncedCount ?? 0,
      skippedCount: syncState.skippedCount ?? 0,
      failedCount: syncState.failedCount ?? 0,
      rateLimitedCount: syncState.rateLimitedCount ?? 0,
      status,
      completedAt: syncState.completedAt ?? null,
      lastSuccessfulSyncAt: syncState.lastSuccessfulSyncAt ?? null,
      lastErrorCode: syncState.lastErrorCode ?? null,
      lastErrorMessage: syncState.lastErrorMessage ?? null,
      hasResults: (syncState.importedCount ?? 0) > 0 || (syncState.updatedCount ?? 0) > 0 || (syncState.routesSyncedCount ?? 0) > 0 || (syncState.skippedCount ?? 0) > 0 || (syncState.failedCount ?? 0) > 0 || (syncState.rateLimitedCount ?? 0) > 0,
    };
  }
}

function emptySummary(): SyncSummary {
  return {
    importedCount: 0,
    updatedCount: 0,
    routesSyncedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    rateLimitedCount: 0,
    status: null,
    completedAt: null,
    lastSuccessfulSyncAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    hasResults: false,
  };
}

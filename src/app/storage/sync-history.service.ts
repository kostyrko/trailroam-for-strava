import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import type { SyncHistoryRecord } from './storage.models';

export type SyncTrigger = SyncHistoryRecord['trigger'];

@Injectable({ providedIn: 'root' })
export class SyncHistoryService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  async record(trigger: SyncTrigger, stats: {
    importedCount: number;
    updatedCount: number;
    routesSyncedCount: number;
    skippedCount: number;
    failedCount: number;
    rateLimitedCount: number;
    status: SyncHistoryRecord['status'];
    errorMessage?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const [totalActivities, activitiesWithRoutes] = await Promise.all([
      this.repositories.activities.count(),
      this.repositories.activityRoutes.count(),
    ]);

    await this.repositories.syncHistory.put({
      id: crypto.randomUUID(),
      trigger,
      startedAt: now,
      completedAt: now,
      ...stats,
      totalActivitiesAfter: totalActivities,
      activitiesWithRoutesAfter: activitiesWithRoutes,
      activitiesWithoutRoutesAfter: totalActivities - activitiesWithRoutes,
    });

    await this.resetDismissedSync();
  }

  async list(): Promise<SyncHistoryRecord[]> {
    return this.repositories.syncHistory.list();
  }

  async clear(): Promise<void> {
    await this.repositories.syncHistory.clear();
  }

  private async resetDismissedSync(): Promise<void> {
    const settings = await this.repositories.settings.get();
    if (settings?.dismissedSyncAt) {
      settings.dismissedSyncAt = undefined;
      settings.updatedAt = new Date().toISOString();
      await this.repositories.settings.put(settings);
    }
  }
}

import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import { DATABASE_SCHEMA_VERSION } from './storage.models';

export interface TrailroamBackupFile {
  schemaVersion: number;
  exportedAt: string;
  settings: unknown[];
  accessState: unknown[];
  syncState: unknown[];
  activities: unknown[];
  activityRoutes: unknown[];
}

@Injectable({
  providedIn: 'root',
})
export class LocalDataService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  async clearSyncedLocalData(): Promise<void> {
    await Promise.all([
      this.repositories.activities.clear(),
      this.repositories.activityRoutes.clear(),
      this.repositories.syncState.clear(),
    ]);
  }

  async backup(): Promise<TrailroamBackupFile> {
    const [settings, accessState, syncState, activities, activityRoutes] = await Promise.all([
      this.repositories.settings.list(),
      this.repositories.accessState.list(),
      this.repositories.syncState.list(),
      this.repositories.activities.list(),
      this.repositories.activityRoutes.list(),
    ]);

    return {
      schemaVersion: DATABASE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
      accessState,
      syncState,
      activities,
      activityRoutes,
    };
  }
}

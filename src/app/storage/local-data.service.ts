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

export interface RestoreResult {
  settingsCount: number;
  accessStateCount: number;
  syncStateCount: number;
  activitiesCount: number;
  activityRoutesCount: number;
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
      this.repositories.syncHistory.clear(),
    ]);
  }

  validateBackup(data: unknown): TrailroamBackupFile {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid backup file: not an object.');
    }
    const backup = data as { [key: string]: unknown };
    if (typeof backup['schemaVersion'] !== 'number') {
      throw new Error('Invalid backup file: missing or invalid schemaVersion.');
    }
    if (!Array.isArray(backup['settings'])) {
      throw new Error('Invalid backup file: missing or invalid settings.');
    }
    if (!Array.isArray(backup['accessState'])) {
      throw new Error('Invalid backup file: missing or invalid accessState.');
    }
    if (!Array.isArray(backup['syncState'])) {
      throw new Error('Invalid backup file: missing or invalid syncState.');
    }
    if (!Array.isArray(backup['activities'])) {
      throw new Error('Invalid backup file: missing or invalid activities.');
    }
    if (!Array.isArray(backup['activityRoutes'])) {
      throw new Error('Invalid backup file: missing or invalid activityRoutes.');
    }
    return data as TrailroamBackupFile;
  }

  async restore(backup: TrailroamBackupFile): Promise<RestoreResult> {
    this.validateBackup(backup);

    await Promise.all([
      this.repositories.settings.clear(),
      this.repositories.accessState.clear(),
      this.repositories.syncState.clear(),
      this.repositories.activities.clear(),
      this.repositories.activityRoutes.clear(),
    ]);

    const settingsCount = await Promise.all(backup.settings.map((s) => this.repositories.settings.put(s as any)))
      .then((r) => r.length);
    const accessStateCount = await Promise.all(backup.accessState.map((a) => this.repositories.accessState.put(a as any)))
      .then((r) => r.length);
    const syncStateCount = await Promise.all(backup.syncState.map((s) => this.repositories.syncState.put(s as any)))
      .then((r) => r.length);
    const activitiesCount = await Promise.all(backup.activities.map((a) => this.repositories.activities.put(a as any)))
      .then((r) => r.length);
    const activityRoutesCount = await Promise.all(
      backup.activityRoutes.map((r) => this.repositories.activityRoutes.put(r as any)),
    ).then((r) => r.length);

    return { settingsCount, accessStateCount, syncStateCount, activitiesCount, activityRoutesCount };
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

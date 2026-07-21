import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import {
  DATABASE_SCHEMA_VERSION,
  type ActivityRecord,
  type ActivityRouteRecord,
  type RouteGeometryRecord,
  type SavedPlaceRecord,
  type SettingsRecord,
  type AccessStateRecord,
  type SyncStateRecord,
  type TrailRecord,
} from './storage.models';

export const BACKUP_SCHEMA_VERSION = 1;
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;
export const MAX_SUPPORTED_SCHEMA_VERSION = 1;

export interface TrailroamBackupFile {
  schemaVersion: number;
  exportedAt: string;
  settings: unknown[];
  accessState: unknown[];
  syncState: unknown[];
  activities: unknown[];
  activityRoutes: unknown[];
  routeGeometry?: unknown[];
  savedPlaces?: unknown[];
  trails?: unknown[];
}

export interface RestoreResult {
  settingsCount: number;
  accessStateCount: number;
  syncStateCount: number;
  activitiesCount: number;
  activityRoutesCount: number;
  routeGeometryCount: number;
  savedPlacesCount: number;
  trailsCount: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((v) => isObject(v));
}

function validateSettingsRecord(value: unknown): value is SettingsRecord {
  if (!isObject(value)) return false;
  if (value['id'] !== 'default') return false;
  if (value['mapProvider'] !== 'openfreemap') return false;
  if (!isString(value['createdAt'])) return false;
  if (!isString(value['updatedAt'])) return false;
  return true;
}

function validateAccessStateRecord(value: unknown): value is AccessStateRecord {
  if (!isObject(value)) return false;
  if (value['id'] !== 'default') return false;
  if (!isString(value['status'])) return false;
  if (!isString(value['updatedAt'])) return false;
  return true;
}

function validateSyncStateRecord(value: unknown): value is SyncStateRecord {
  if (!isObject(value)) return false;
  if (value['id'] !== 'default') return false;
  if (!isString(value['status'])) return false;
  return true;
}

function validateActivityRecord(value: unknown): value is ActivityRecord {
  if (!isObject(value)) return false;
  if (!isString(value['id'])) return false;
  if (
    !isString(value['provider']) ||
    (value['provider'] !== 'strava' && value['provider'] !== 'local')
  )
    return false;
  if (!isString(value['providerActivityId'])) return false;
  if (!isString(value['name'])) return false;
  if (!isString(value['sportType'])) return false;
  if (!isString(value['activityCategory'])) return false;
  if (!isString(value['startDate'])) return false;
  if (!isBoolean(value['hasRoute'])) return false;
  if (!isString(value['routeSyncStatus'])) return false;
  if (!isString(value['importedAt'])) return false;
  if (!isString(value['updatedAt'])) return false;
  return true;
}

function validateActivityRouteRecord(value: unknown): value is ActivityRouteRecord {
  if (!isObject(value)) return false;
  if (!isString(value['activityId'])) return false;
  if (!isString(value['providerActivityId'])) return false;
  if (!Array.isArray(value['simplifiedCoordinates'])) return false;
  if (!isNumber(value['simplifiedPointCount'])) return false;
  if (!isNumber(value['pointCount'])) return false;
  if (!isString(value['syncedAt'])) return false;
  if (!isString(value['updatedAt'])) return false;
  return true;
}

function validateRouteGeometryRecord(value: unknown): value is RouteGeometryRecord {
  if (!isObject(value)) return false;
  if (!isString(value['activityId'])) return false;
  if (!isString(value['providerActivityId'])) return false;
  if (!Array.isArray(value['coordinates'])) return false;
  if (!isString(value['syncedAt'])) return false;
  if (!isString(value['updatedAt'])) return false;
  return true;
}

function validateSavedPlaceRecord(value: unknown): value is SavedPlaceRecord {
  if (!isObject(value)) return false;
  if (!isString(value['id'])) return false;
  if (!isString(value['name'])) return false;
  if (!isNumber(value['latitude'])) return false;
  if (!isNumber(value['longitude'])) return false;
  if (!isString(value['createdAt'])) return false;
  if (!isString(value['updatedAt'])) return false;
  return true;
}

function validateTrailRecord(value: unknown): value is TrailRecord {
  if (!isObject(value)) return false;
  if (!isString(value['id'])) return false;
  if (!isString(value['name'])) return false;
  if (!Array.isArray(value['activityIds'])) return false;
  if (!value['activityIds'].every((id: unknown) => isString(id))) return false;
  if (!isString(value['createdAt'])) return false;
  if (!isString(value['updatedAt'])) return false;
  return true;
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
      this.repositories.routeGeometry.clear(),
      this.repositories.syncState.clear(),
      this.repositories.syncHistory.clear(),
    ]);
  }

  validateBackup(data: unknown): TrailroamBackupFile {
    if (!isObject(data)) {
      throw new Error('Invalid backup file: not an object.');
    }
    const schemaVersion = data['schemaVersion'];
    if (!isNumber(schemaVersion)) {
      throw new Error('Invalid backup file: missing or invalid schemaVersion.');
    }
    if (
      schemaVersion < MIN_SUPPORTED_SCHEMA_VERSION ||
      schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION
    ) {
      throw new Error(
        `Unsupported backup schema version ${schemaVersion}. Expected ${MIN_SUPPORTED_SCHEMA_VERSION}.`,
      );
    }
    if (!Array.isArray(data['settings'])) {
      throw new Error('Invalid backup file: missing or invalid settings.');
    }
    if (!Array.isArray(data['accessState'])) {
      throw new Error('Invalid backup file: missing or invalid accessState.');
    }
    if (!Array.isArray(data['syncState'])) {
      throw new Error('Invalid backup file: missing or invalid syncState.');
    }
    if (!Array.isArray(data['activities'])) {
      throw new Error('Invalid backup file: missing or invalid activities.');
    }
    if (!Array.isArray(data['activityRoutes'])) {
      throw new Error('Invalid backup file: missing or invalid activityRoutes.');
    }
    return data as unknown as TrailroamBackupFile;
  }

  private filterValidRecords<T>(records: unknown[], validator: (v: unknown) => v is T): T[] {
    return records.filter(validator);
  }

  async restore(backup: TrailroamBackupFile): Promise<RestoreResult> {
    this.validateBackup(backup);

    await Promise.all([
      this.repositories.settings.clear(),
      this.repositories.accessState.clear(),
      this.repositories.syncState.clear(),
      this.repositories.activities.clear(),
      this.repositories.activityRoutes.clear(),
      this.repositories.routeGeometry.clear(),
      this.repositories.savedPlaces.clear(),
      this.repositories.trails.clear(),
    ]);

    const validSettings = this.filterValidRecords(backup.settings, validateSettingsRecord);
    const validAccessState = this.filterValidRecords(backup.accessState, validateAccessStateRecord);
    const validSyncState = this.filterValidRecords(backup.syncState, validateSyncStateRecord);
    const validActivities = this.filterValidRecords(backup.activities, validateActivityRecord);
    const validActivityRoutes = this.filterValidRecords(
      backup.activityRoutes,
      validateActivityRouteRecord,
    );
    const validRouteGeometry = backup.routeGeometry
      ? this.filterValidRecords(backup.routeGeometry, validateRouteGeometryRecord)
      : [];
    const validSavedPlaces = backup.savedPlaces
      ? this.filterValidRecords(backup.savedPlaces, validateSavedPlaceRecord)
      : [];
    const validTrails = backup.trails
      ? this.filterValidRecords(backup.trails, validateTrailRecord)
      : [];

    const settingsCount = await Promise.all(
      validSettings.map((s) => this.repositories.settings.put(s)),
    ).then((r) => r.length);
    const accessStateCount = await Promise.all(
      validAccessState.map((a) => this.repositories.accessState.put(a)),
    ).then((r) => r.length);
    const syncStateCount = await Promise.all(
      validSyncState.map((s) => this.repositories.syncState.put(s)),
    ).then((r) => r.length);
    const activitiesCount = await Promise.all(
      validActivities.map((a) => this.repositories.activities.put(a)),
    ).then((r) => r.length);
    const activityRoutesCount = await Promise.all(
      validActivityRoutes.map((r) => this.repositories.activityRoutes.put(r)),
    ).then((r) => r.length);
    const routeGeometryCount = await Promise.all(
      validRouteGeometry.map((g) => this.repositories.routeGeometry.put(g)),
    ).then((r) => r.length);
    const savedPlacesCount = await Promise.all(
      validSavedPlaces.map((p) => this.repositories.savedPlaces.put(p)),
    ).then((r) => r.length);
    const trailsCount = await Promise.all(
      validTrails.map((t) => this.repositories.trails.put(t)),
    ).then((r) => r.length);

    return {
      settingsCount,
      accessStateCount,
      syncStateCount,
      activitiesCount,
      activityRoutesCount,
      routeGeometryCount,
      savedPlacesCount,
      trailsCount,
    };
  }

  async backup(): Promise<TrailroamBackupFile> {
    const [
      settings,
      accessState,
      syncState,
      activities,
      activityRoutes,
      routeGeometry,
      savedPlaces,
      trails,
    ] = await Promise.all([
      this.repositories.settings.list(),
      this.repositories.accessState.list(),
      this.repositories.syncState.list(),
      this.repositories.activities.list(),
      this.repositories.activityRoutes.list(),
      this.repositories.routeGeometry.list(),
      this.repositories.savedPlaces.list(),
      this.repositories.trails.list(),
    ]);

    return {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
      accessState,
      syncState,
      activities,
      activityRoutes,
      routeGeometry,
      savedPlaces,
      trails,
    };
  }
}

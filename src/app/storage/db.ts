import Dexie, { type Table } from 'dexie';
import {
  type AccessStateRecord,
  type ActivityRecord,
  type ActivityRouteRecord,
  DATABASE_SCHEMA_VERSION,
  type SettingsRecord,
  type SyncStateRecord,
} from './storage.models';

export const DATABASE_NAME = 'trailroam_for_strava';

export class TrailroamDatabase extends Dexie {
  activities!: Table<ActivityRecord, string>;
  activity_routes!: Table<ActivityRouteRecord, string>;
  sync_state!: Table<SyncStateRecord, string>;
  settings!: Table<SettingsRecord, string>;
  access_state!: Table<AccessStateRecord, string>;

  constructor(databaseName = DATABASE_NAME) {
    super(databaseName);

    this.version(DATABASE_SCHEMA_VERSION).stores({
      activities: 'id, providerActivityId, startDate, sportType, activityCategory, hasRoute, routeSyncStatus',
      activity_routes: 'activityId, providerActivityId, syncedAt, pointCount',
      sync_state: 'id, status, lastSuccessfulSyncAt',
      settings: 'id, mapProvider, updatedAt',
      access_state: 'id, status, updatedAt',
    });
  }
}

export const appDb = new TrailroamDatabase();

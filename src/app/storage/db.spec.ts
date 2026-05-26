import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { TrailroamDatabase } from './db';
import { createRepositories } from './repositories';
import {
  AccessStateRecord,
  ActivityRecord,
  ActivityRouteRecord,
  DATABASE_SCHEMA_VERSION,
  DEFAULT_RECORD_ID,
  SettingsRecord,
  SyncStateRecord,
} from './storage.models';

describe('TrailroamDatabase', () => {
  let db: TrailroamDatabase;

  beforeEach(async () => {
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    db = new TrailroamDatabase(`trailroam_test_${Date.now()}_${Math.random()}`);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('should initialize schema version 1 with initial tables', () => {
    expect(db.verno).toBe(DATABASE_SCHEMA_VERSION);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'access_state',
      'activities',
      'activity_routes',
      'settings',
      'sync_state',
    ]);
  });

  it('should read and write records through repositories', async () => {
    const repositories = createRepositories(db);
    const now = new Date().toISOString();

    const activity: ActivityRecord = {
      id: 'strava:100',
      provider: 'strava',
      providerActivityId: '100',
      name: 'Morning Ride',
      sportType: 'Ride',
      activityCategory: 'ride',
      startDate: '2026-05-01T08:00:00.000Z',
      distanceMeters: 42000,
      movingTimeSeconds: 7200,
      hasRoute: true,
      routeSyncStatus: 'route_synced',
      importedAt: now,
      updatedAt: now,
    };

    const route: ActivityRouteRecord = {
      activityId: activity.id,
      providerActivityId: activity.providerActivityId,
      coordinates: [
        [19.94498, 50.06465],
        [19.9459, 50.0654],
      ],
      pointCount: 2,
      bounds: {
        west: 19.94498,
        south: 50.06465,
        east: 19.9459,
        north: 50.0654,
      },
      syncedAt: now,
      updatedAt: now,
    };

    const syncState: SyncStateRecord = {
      id: DEFAULT_RECORD_ID,
      status: 'idle',
      lastSuccessfulSyncAt: now,
    };

    const settings: SettingsRecord = {
      id: DEFAULT_RECORD_ID,
      mapProvider: 'openfreemap',
      createdAt: now,
      updatedAt: now,
    };

    const accessState: AccessStateRecord = {
      id: DEFAULT_RECORD_ID,
      status: 'beta_unrestricted',
      maxVisibleActivities: null,
      updatedAt: now,
    };

    await repositories.activities.put(activity);
    await repositories.activityRoutes.put(route);
    await repositories.syncState.put(syncState);
    await repositories.settings.put(settings);
    await repositories.accessState.put(accessState);

    await expect(repositories.activities.get(activity.id)).resolves.toEqual(activity);
    await expect(repositories.activities.list()).resolves.toEqual([activity]);
    await expect(repositories.activityRoutes.get(activity.id)).resolves.toEqual(route);
    await expect(repositories.activityRoutes.list()).resolves.toEqual([route]);
    await expect(repositories.syncState.get()).resolves.toEqual(syncState);
    await expect(repositories.settings.get()).resolves.toEqual(settings);
    await expect(repositories.accessState.get()).resolves.toEqual(accessState);
  });

  it('should create default OpenFreeMap settings without requiring a provider key', async () => {
    const repositories = createRepositories(db);
    const now = new Date('2026-05-26T10:00:00.000Z');

    const settings = await repositories.settings.getOrCreateDefault(now);

    expect(settings).toEqual({
      id: DEFAULT_RECORD_ID,
      mapProvider: 'openfreemap',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect('apiKey' in settings).toBe(false);
    await expect(repositories.settings.get()).resolves.toEqual(settings);
  });

  it('should keep existing settings after reopening the database', async () => {
    const databaseName = db.name;
    const repositories = createRepositories(db);
    const settings = await repositories.settings.getOrCreateDefault(
      new Date('2026-05-26T10:00:00.000Z'),
    );

    db.close();
    db = new TrailroamDatabase(databaseName);
    await db.open();

    await expect(
      createRepositories(db).settings.getOrCreateDefault(new Date('2026-05-26T11:00:00.000Z')),
    ).resolves.toEqual(settings);
  });
});

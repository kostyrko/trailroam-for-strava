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
  SavedPlaceRecord,
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

  it('should initialize database with all tables', () => {
    expect(db.verno).toBe(DATABASE_SCHEMA_VERSION);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'access_state',
      'activities',
      'activity_routes',
      'route_geometry',
      'saved_places',
      'settings',
      'sync_history',
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
      totalElevationGainMeters: 350,
      averageSpeedMetersPerSecond: 8.3,
      averageHeartrateBpm: 145,
      hasRoute: true,
      routeSyncStatus: 'route_synced',
      importedAt: now,
      updatedAt: now,
    };

    const route: ActivityRouteRecord = {
      activityId: activity.id,
      providerActivityId: activity.providerActivityId,
      simplifiedCoordinates: [
        [19.94498, 50.06465],
        [19.9459, 50.0654],
      ],
      simplifiedPointCount: 2,
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

  describe('activities upsert', () => {
    function createActivity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
      const now = new Date().toISOString();
      return {
        id: 'strava:100',
        provider: 'strava',
        providerActivityId: '100',
        name: 'Morning Ride',
        sportType: 'Ride',
        activityCategory: 'ride',
        startDate: '2026-05-01T08:00:00.000Z',
        distanceMeters: 42000,
        movingTimeSeconds: 7200,
        totalElevationGainMeters: 350,
        averageSpeedMetersPerSecond: 8.3,
        averageHeartrateBpm: 145,
        hasRoute: false,
        routeSyncStatus: 'not_attempted',
        importedAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    it('should insert a new record and return inserted: true', async () => {
      const repositories = createRepositories(db);
      const activity = createActivity();

      const result = await repositories.activities.upsert(activity);

      expect(result.inserted).toBe(true);
      expect(result.activity.id).toBe('strava:100');
    });

    it('should return inserted: false for an existing record', async () => {
      const repositories = createRepositories(db);
      const activity = createActivity();

      await repositories.activities.upsert(activity);
      const result = await repositories.activities.upsert(activity);

      expect(result.inserted).toBe(false);
    });

    it('should preserve hasRoute from the existing record when it was set to true', async () => {
      const repositories = createRepositories(db);
      const activity = createActivity({ hasRoute: true });

      await repositories.activities.upsert(activity);

      const updatedActivity = createActivity({ name: 'Updated Name', hasRoute: false });
      const result = await repositories.activities.upsert(updatedActivity);

      expect(result.activity.hasRoute).toBe(true);
    });

    it('should preserve routeSyncStatus from the existing record', async () => {
      const repositories = createRepositories(db);
      const activity = createActivity({ routeSyncStatus: 'route_synced' });

      await repositories.activities.upsert(activity);

      const updatedActivity = createActivity({ name: 'Updated Name', routeSyncStatus: 'not_attempted' });
      const result = await repositories.activities.upsert(updatedActivity);

      expect(result.activity.name).toBe('Updated Name');
      expect(result.activity.routeSyncStatus).toBe('route_synced');
    });

    it('should update updatedAt on existing records', async () => {
      const repositories = createRepositories(db);
      const activity = createActivity();

      await repositories.activities.upsert(activity);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedActivity = createActivity({ name: 'Updated Name' });
      const result = await repositories.activities.upsert(updatedActivity);

      expect(result.activity.updatedAt).not.toBe(activity.updatedAt);
      expect(new Date(result.activity.updatedAt).getTime()).toBeGreaterThan(
        new Date(activity.updatedAt).getTime(),
      );
    });

    it('should preserve importedAt from the existing record', async () => {
      const repositories = createRepositories(db);
      const activity = createActivity();

      await repositories.activities.upsert(activity);

      const updatedActivity = createActivity({ name: 'Updated Name' });
      const result = await repositories.activities.upsert(updatedActivity);

      expect(result.activity.importedAt).toBe(activity.importedAt);
    });

    it('should not duplicate records when upserting multiple times', async () => {
      const repositories = createRepositories(db);

      await repositories.activities.upsert(createActivity());
      await repositories.activities.upsert(createActivity({ name: 'Updated Name' }));
      await repositories.activities.upsert(createActivity({ name: 'Updated Again' }));

      const all = await repositories.activities.list();
      expect(all).toHaveLength(1);
    });

    it('should upsert multiple distinct activities without conflict', async () => {
      const repositories = createRepositories(db);

      const result1 = await repositories.activities.upsert(createActivity({ id: 'strava:1', providerActivityId: '1' }));
      const result2 = await repositories.activities.upsert(createActivity({ id: 'strava:2', providerActivityId: '2' }));

      expect(result1.inserted).toBe(true);
      expect(result2.inserted).toBe(true);
      expect(await repositories.activities.list()).toHaveLength(2);
    });
  });

  describe('activity routes upsert', () => {
    function createRoute(overrides: Partial<ActivityRouteRecord> = {}): ActivityRouteRecord {
      const now = new Date().toISOString();
      return {
        activityId: 'strava:100',
        providerActivityId: '100',
        simplifiedCoordinates: [[19.94, 50.06]],
        simplifiedPointCount: 1,
        pointCount: 1,
        bounds: { west: 19.94, south: 50.06, east: 19.94, north: 50.06 },
        syncedAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    it('should insert a new route record and return inserted: true', async () => {
      const repositories = createRepositories(db);
      const route = createRoute();

      const result = await repositories.activityRoutes.upsert(route);

      expect(result.inserted).toBe(true);
      expect(result.route.activityId).toBe('strava:100');
    });

    it('should return inserted: false for an existing route record', async () => {
      const repositories = createRepositories(db);
      const route = createRoute();

      await repositories.activityRoutes.upsert(route);
      const result = await repositories.activityRoutes.upsert(route);

      expect(result.inserted).toBe(false);
    });

    it('should preserve syncedAt from the existing record', async () => {
      const repositories = createRepositories(db);
      const route = createRoute();

      await repositories.activityRoutes.upsert(route);

      const updatedRoute = createRoute({ simplifiedCoordinates: [[19.95, 50.07], [19.96, 50.08]], simplifiedPointCount: 2, pointCount: 2 });
      const result = await repositories.activityRoutes.upsert(updatedRoute);

      expect(result.route.syncedAt).toBe(route.syncedAt);
    });

    it('should update updatedAt on existing records', async () => {
      const repositories = createRepositories(db);
      const route = createRoute();

      await repositories.activityRoutes.upsert(route);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedRoute = createRoute({ simplifiedCoordinates: [[19.95, 50.07]], simplifiedPointCount: 1, pointCount: 1 });
      const result = await repositories.activityRoutes.upsert(updatedRoute);

      expect(new Date(result.route.updatedAt).getTime()).toBeGreaterThan(
        new Date(route.updatedAt).getTime(),
      );
    });

    it('should not duplicate routes when upserting multiple times', async () => {
      const repositories = createRepositories(db);

      await repositories.activityRoutes.upsert(createRoute());
      await repositories.activityRoutes.upsert(createRoute({ simplifiedCoordinates: [[19.95, 50.07]], simplifiedPointCount: 1, pointCount: 1 }));
      await repositories.activityRoutes.upsert(createRoute({ simplifiedCoordinates: [[19.96, 50.08]], simplifiedPointCount: 1, pointCount: 1 }));

      const all = await repositories.activityRoutes.list();
      expect(all).toHaveLength(1);
    });
  });

  describe('updateRouteSyncStatus', () => {
    function createActivity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
      const now = new Date().toISOString();
      return {
        id: 'strava:100',
        provider: 'strava',
        providerActivityId: '100',
        name: 'Morning Ride',
        sportType: 'Ride',
        activityCategory: 'ride',
        startDate: '2026-05-01T08:00:00.000Z',
        hasRoute: false,
        routeSyncStatus: 'not_attempted',
        importedAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    it('should update hasRoute and routeSyncStatus on an existing activity', async () => {
      const repositories = createRepositories(db);
      await repositories.activities.put(createActivity());

      await repositories.activities.updateRouteSyncStatus('strava:100', true, 'route_synced');

      const activity = await repositories.activities.get('strava:100');
      expect(activity?.hasRoute).toBe(true);
      expect(activity?.routeSyncStatus).toBe('route_synced');
    });

    it('should update updatedAt when changing route sync status', async () => {
      const repositories = createRepositories(db);
      await repositories.activities.put(createActivity());

      await new Promise((resolve) => setTimeout(resolve, 10));
      await repositories.activities.updateRouteSyncStatus('strava:100', false, 'no_route');

      const activity = await repositories.activities.get('strava:100');
      expect(activity?.routeSyncStatus).toBe('no_route');
      expect(activity?.updatedAt).not.toBe(activity?.importedAt);
    });

    it('should only update hasRoute and routeSyncStatus, not other fields', async () => {
      const repositories = createRepositories(db);
      const activity = createActivity({ name: 'Original Name', distanceMeters: 5000 });
      await repositories.activities.put(activity);

      await repositories.activities.updateRouteSyncStatus('strava:100', false, 'no_route');

      const updated = await repositories.activities.get('strava:100');
      expect(updated?.name).toBe('Original Name');
      expect(updated?.distanceMeters).toBe(5000);
    });
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

  describe('saved places repository', () => {
    it('lists saved places newest-first and supports get/put/delete', async () => {
      const repositories = createRepositories(db);
      const base = {
        name: 'Kraków',
        latitude: 50.0614,
        longitude: 19.9372,
      };
      const older: SavedPlaceRecord = {
        ...base,
        id: 'place:older',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      };
      const newer: SavedPlaceRecord = {
        ...base,
        id: 'place:newer',
        name: 'Zakopane',
        latitude: 49.2992,
        longitude: 19.9496,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      };
      await repositories.savedPlaces.put(older);
      await repositories.savedPlaces.put(newer);

      const list = await repositories.savedPlaces.list();
      expect(list.map((p) => p.id)).toEqual(['place:newer', 'place:older']);

      expect((await repositories.savedPlaces.get('place:newer'))?.name).toBe('Zakopane');

      await repositories.savedPlaces.delete('place:older');
      expect(await repositories.savedPlaces.list()).toHaveLength(1);
      expect(await repositories.savedPlaces.count()).toBe(1);
    });

    it('finds a duplicate by providerId and by 10m proximity', async () => {
      const repositories = createRepositories(db);
      const existing: SavedPlaceRecord = {
        id: 'place:1',
        name: 'Kraków',
        latitude: 50.0614,
        longitude: 19.9372,
        providerId: 'R123456',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      };
      await repositories.savedPlaces.put(existing);

      expect(await repositories.savedPlaces.findByProviderId('R123456')).toBeDefined();
      expect(await repositories.savedPlaces.findByProviderId('N999')).toBeUndefined();

      // ~5m away — within the 10m duplicate radius.
      const nearby = await repositories.savedPlaces.findWithinRadiusMeters(50.06143, 19.93723);
      expect(nearby?.id).toBe('place:1');
      // ~1km away — not a duplicate.
      expect(await repositories.savedPlaces.findWithinRadiusMeters(50.07, 19.94)).toBeUndefined();
    });
  });

  describe('schema upgrades', () => {
    it('upgrades an existing v3 database to v5 with saved_places available and prior data intact', async () => {
      const databaseName = `trailroam_upgrade_${Date.now()}_${Math.random()}`;

      // Seed a database at v3 (no route_geometry, no saved_places) with an activity.
      const legacy = new Dexie(databaseName);
      legacy.version(3).stores({
        activities: 'id, providerActivityId, startDate, sportType, activityCategory, hasRoute, routeSyncStatus',
        activity_routes: 'activityId, providerActivityId, syncedAt, pointCount, simplifiedPointCount',
        sync_state: 'id, status, lastSuccessfulSyncAt',
        settings: 'id, mapProvider, updatedAt',
        access_state: 'id, status, updatedAt',
        sync_history: 'id, trigger, completedAt',
      });
      await legacy.open();
      const now = '2026-07-01T00:00:00.000Z';
      await legacy.table('activities').put({
        id: 'strava:1', provider: 'strava', providerActivityId: '1', name: 'Legacy Ride',
        sportType: 'Ride', activityCategory: 'ride', startDate: now, hasRoute: true,
        routeSyncStatus: 'route_synced', importedAt: now, updatedAt: now,
      });
      legacy.close();

      // Reopen with the current schema; Dexie must run the v4 + v5 upgrade steps.
      const upgraded = new TrailroamDatabase(databaseName);
      await upgraded.open();
      expect(upgraded.verno).toBe(DATABASE_SCHEMA_VERSION);
      expect(upgraded.tables.map((t) => t.name).sort()).toContain('saved_places');
      expect(upgraded.tables.map((t) => t.name).sort()).toContain('route_geometry');

      // Prior data survives the upgrade.
      const surviving = await createRepositories(upgraded).activities.get('strava:1');
      expect(surviving?.name).toBe('Legacy Ride');

      // The new saved_places store is writable.
      const place: SavedPlaceRecord = {
        id: 'place:1', name: 'Kraków', latitude: 50.0614, longitude: 19.9372, createdAt: now, updatedAt: now,
      };
      await createRepositories(upgraded).savedPlaces.put(place);
      expect(await createRepositories(upgraded).savedPlaces.list()).toHaveLength(1);

      upgraded.close();
      await upgraded.delete();
    });
  });
});

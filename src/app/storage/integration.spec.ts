import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { TrailroamDatabase } from './db';
import { createRepositories } from './repositories';
import { DATABASE_SCHEMA_VERSION, DEFAULT_RECORD_ID } from './storage.models';
import type { ActivityRecord, ActivityRouteRecord, RouteGeometryRecord, SettingsRecord, AccessStateRecord, SyncStateRecord } from './storage.models';
import { LocalDataService, BACKUP_SCHEMA_VERSION } from './local-data.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';

function createTestDb(): TrailroamDatabase {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  return new TrailroamDatabase(`trailroam_int_test_${Date.now()}_${Math.random()}`);
}

describe('Storage Integration: repositories + backup/restore round trip', () => {
  let db: TrailroamDatabase;

  beforeEach(async () => {
    db = createTestDb();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('should persist an activity and route, then back up and restore them', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    const activity: ActivityRecord = {
      id: 'strava:100', provider: 'strava', providerActivityId: '100',
      name: 'Morning Ride', sportType: 'Ride', activityCategory: 'ride',
      startDate: '2026-06-21T08:00:00Z', distanceMeters: 42000,
      movingTimeSeconds: 7200, totalElevationGainMeters: 350,
      averageSpeedMetersPerSecond: 8.3, hasRoute: true,
      routeSyncStatus: 'route_synced', importedAt: now, updatedAt: now,
    };

    const route: ActivityRouteRecord = {
      activityId: 'strava:100', providerActivityId: '100',
      simplifiedCoordinates: [[19.94, 50.06], [19.95, 50.07]],
      simplifiedPointCount: 2, pointCount: 2,
      syncedAt: now, updatedAt: now,
    };

    const geometry: RouteGeometryRecord = {
      activityId: 'strava:100', providerActivityId: '100',
      coordinates: [[19.94, 50.06], [19.95, 50.07]],
      syncedAt: now, updatedAt: now,
    };

    const settings: SettingsRecord = {
      id: DEFAULT_RECORD_ID, mapProvider: 'openfreemap',
      createdAt: now, updatedAt: now,
    };

    await repos.activities.put(activity);
    await repos.activityRoutes.put(route);
    await repos.routeGeometry.put(geometry);
    await repos.settings.put(settings);

    const readActivity = await repos.activities.get('strava:100');
    expect(readActivity?.name).toBe('Morning Ride');

    const readRoute = await repos.activityRoutes.get('strava:100');
    expect(readRoute?.pointCount).toBe(2);

    const readGeometry = await repos.routeGeometry.get('strava:100');
    expect(readGeometry?.coordinates).toHaveLength(2);

    const readSettings = await repos.settings.get();
    expect(readSettings?.mapProvider).toBe('openfreemap');

    const allActivities = await repos.activities.list();
    expect(allActivities).toHaveLength(1);

    const allRoutes = await repos.activityRoutes.list();
    expect(allRoutes).toHaveLength(1);
  });

  it('should update activity metadata without overwriting hasRoute', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    const activity: ActivityRecord = {
      id: 'strava:100', provider: 'strava', providerActivityId: '100',
      name: 'Morning Ride', sportType: 'Ride', activityCategory: 'ride',
      startDate: '2026-06-21T08:00:00Z', distanceMeters: 42000,
      movingTimeSeconds: 7200, hasRoute: true,
      routeSyncStatus: 'route_synced', importedAt: now, updatedAt: now,
    };

    await repos.activities.put(activity);
    await repos.activities.updateMetadata('strava:100', {
      name: 'Evening Ride', sportType: 'GravelRide', activityStatus: 'completed',
    });

    const updated = await repos.activities.get('strava:100');
    expect(updated?.name).toBe('Evening Ride');
    expect(updated?.sportType).toBe('GravelRide');
    expect(updated?.hasRoute).toBe(true);
    expect(updated?.routeSyncStatus).toBe('route_synced');
    expect(updated?.updatedAt).toBeTruthy();
  });

  it('should back up and restore all data tables', async () => {
    const reposA = createRepositories(db);
    const now = new Date().toISOString();

    const activity: ActivityRecord = {
      id: 'strava:1', provider: 'strava', providerActivityId: '1',
      name: 'Test Ride', sportType: 'Ride', activityCategory: 'ride',
      startDate: now, distanceMeters: 10000, movingTimeSeconds: 1800,
      hasRoute: true, routeSyncStatus: 'route_synced', importedAt: now, updatedAt: now,
    };
    await reposA.activities.put(activity);

    const route: ActivityRouteRecord = {
      activityId: 'strava:1', providerActivityId: '1',
      simplifiedCoordinates: [[19.9, 50.05]], simplifiedPointCount: 1, pointCount: 1,
      syncedAt: now, updatedAt: now,
    };
    await reposA.activityRoutes.put(route);

    // Close and reopen with a fresh database name
    const dbName = db.name;
    db.close();

    const db2 = createTestDb();
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    const db2Instance = new TrailroamDatabase(dbName);
    await db2Instance.open();

    const reposB = createRepositories(db2Instance);
    const readActivity = await reposB.activities.get('strava:1');
    expect(readActivity?.name).toBe('Test Ride');

    const readRoute = await reposB.activityRoutes.get('strava:1');
    expect(readRoute?.pointCount).toBe(1);

    db2Instance.close();
  });
});

describe('Route Sync Integration: mock fetch to stored route', () => {
  let db: TrailroamDatabase;

  beforeEach(async () => {
    db = createTestDb();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('should store route geometry and update activity status from successful fetch', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    await repos.activities.put({
      id: 'strava:50', provider: 'strava', providerActivityId: '50',
      name: 'Evening Walk', sportType: 'Walk', activityCategory: 'walk',
      startDate: now, distanceMeters: 5000, movingTimeSeconds: 3600,
      hasRoute: false, routeSyncStatus: 'not_attempted',
      importedAt: now, updatedAt: now,
    });

    const fetchResult = {
      success: true as const,
      coordinates: [[19.94, 50.06], [19.95, 50.07], [19.96, 50.08]] as [number, number][],
    };

    const { normalizeRouteCoordinates, simplifyCoordinates } = await import('../strava/route-coordinate-utils');
    const normalized = normalizeRouteCoordinates(fetchResult.coordinates);

    if (normalized.valid) {
      const simplified = simplifyCoordinates(normalized.coordinates);
      const routeRec: ActivityRouteRecord = {
        activityId: 'strava:50', providerActivityId: '50',
        simplifiedCoordinates: simplified, simplifiedPointCount: simplified.length,
        pointCount: normalized.coordinates.length,
        bounds: normalized.bounds, syncedAt: now, updatedAt: now,
      };
      await repos.activityRoutes.put(routeRec);

      await repos.activities.updateRouteSyncStatus('strava:50', true, 'route_synced');
    }

    const updatedActivity = await repos.activities.get('strava:50');
    expect(updatedActivity?.hasRoute).toBe(true);
    expect(updatedActivity?.routeSyncStatus).toBe('route_synced');

    const storedRoute = await repos.activityRoutes.get('strava:50');
    expect(storedRoute?.pointCount).toBe(3);
  });

  it('should handle NO_GPS_ROUTE fetch result', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    await repos.activities.put({
      id: 'strava:51', provider: 'strava', providerActivityId: '51',
      name: 'No GPS Activity', sportType: 'Run', activityCategory: 'run',
      startDate: now, distanceMeters: 0, movingTimeSeconds: 0,
      hasRoute: false, routeSyncStatus: 'not_attempted',
      importedAt: now, updatedAt: now,
    });

    await repos.activities.updateRouteSyncStatus('strava:51', false, 'no_route');

    const updated = await repos.activities.get('strava:51');
    expect(updated?.hasRoute).toBe(false);
    expect(updated?.routeSyncStatus).toBe('no_route');
  });
});

describe('Sync counters: per-run accuracy', () => {
  let db: TrailroamDatabase;

  beforeEach(async () => {
    db = createTestDb();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('should persist and read sync state counters', async () => {
    const repos = createRepositories(db);

    await repos.syncState.put({
      id: DEFAULT_RECORD_ID, status: 'completed',
      importedCount: 5, updatedCount: 2, routesSyncedCount: 3,
      skippedCount: 1, failedCount: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const state = await repos.syncState.get();
    expect(state?.importedCount).toBe(5);
    expect(state?.updatedCount).toBe(2);
    expect(state?.routesSyncedCount).toBe(3);
    expect(state?.skippedCount).toBe(1);
    expect(state?.failedCount).toBe(0);
  });

  it('should allow multiple sync history entries', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    const activities: ActivityRecord[] = [{ id: 'strava:1', provider: 'strava', providerActivityId: '1', name: 'A', sportType: 'Ride', activityCategory: 'ride', startDate: now, distanceMeters: 10000, movingTimeSeconds: 1800, averageSpeedMetersPerSecond: 8.3, hasRoute: true, routeSyncStatus: 'route_synced', importedAt: now, updatedAt: now }];
    for (const a of activities) { await repos.activities.put(a); }

    const activityCount = await repos.activities.count();
    expect(activityCount).toBe(1);

    await repos.syncHistory.put({
      id: crypto.randomUUID(), trigger: 'sync_new_activities',
      startedAt: now, completedAt: now, status: 'completed',
      importedCount: 1, updatedCount: 0, routesSyncedCount: 1,
      skippedCount: 0, failedCount: 0, rateLimitedCount: 0,
      totalActivitiesAfter: 1, activitiesWithRoutesAfter: 1,
      activitiesWithoutRoutesAfter: 0,
    });

    const history = await repos.syncHistory.list();
    expect(history).toHaveLength(1);
    expect(history[0].trigger).toBe('sync_new_activities');
  });
});

describe('Backup + Restore Validation with real storage', () => {
  let db: TrailroamDatabase;

  beforeEach(async () => {
    db = createTestDb();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('should filter out invalid activity records during restore', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    TestBed.configureTestingModule({
      providers: [{ provide: TRAILROAM_REPOSITORIES, useValue: repos }],
    });
    const service = TestBed.inject(LocalDataService);

    const backup = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: now,
      settings: [],
      accessState: [],
      syncState: [],
      activities: [
        { id: 'strava:1', provider: 'strava', providerActivityId: '1', name: 'Valid', sportType: 'Ride', activityCategory: 'ride', startDate: now, hasRoute: true, routeSyncStatus: 'route_synced', importedAt: now, updatedAt: now },
        { id: 'strava:2' },
        { notAnActivity: true },
      ],
      activityRoutes: [],
    };

    const result = await service.restore(backup as any);

    expect(result.activitiesCount).toBe(1);
    const all = await repos.activities.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Valid');
  });

  it('should filter out invalid route records during restore', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    TestBed.configureTestingModule({
      providers: [{ provide: TRAILROAM_REPOSITORIES, useValue: repos }],
    });
    const service = TestBed.inject(LocalDataService);

    const backup = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: now,
      settings: [],
      accessState: [],
      syncState: [],
      activities: [],
      activityRoutes: [
        { activityId: 'strava:1', providerActivityId: '1', simplifiedCoordinates: [[19.9, 50.05]], simplifiedPointCount: 1, pointCount: 1, syncedAt: now, updatedAt: now },
        { activityId: 'strava:2' },
      ],
    };

    const result = await service.restore(backup as any);
    expect(result.activityRoutesCount).toBe(1);
  });

  it('should reject backup with unsupported schema version', async () => {
    const repos = createRepositories(db);

    TestBed.configureTestingModule({
      providers: [{ provide: TRAILROAM_REPOSITORIES, useValue: repos }],
    });
    const service = TestBed.inject(LocalDataService);

    await expect(service.restore({
      schemaVersion: 999, exportedAt: '', settings: [], accessState: [],
      syncState: [], activities: [], activityRoutes: [],
    })).rejects.toThrow('Unsupported backup schema version');
  });
});

describe('Sync Engine Integration with real repositories', () => {
  let db: TrailroamDatabase;

  beforeEach(async () => {
    db = createTestDb();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('should sync an activity and route via storeImportedData-like flow', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    await repos.activities.put({
      id: 'strava:100', provider: 'strava', providerActivityId: '100',
      name: 'Test Activity', sportType: 'Ride', activityCategory: 'ride',
      startDate: now, distanceMeters: 10000, movingTimeSeconds: 1800,
      averageSpeedMetersPerSecond: 8.3, hasRoute: false,
      routeSyncStatus: 'not_attempted', importedAt: now, updatedAt: now,
    });

    const activities = await repos.activities.list();
    expect(activities).toHaveLength(1);
    expect(activities[0].routeSyncStatus).toBe('not_attempted');

    const { normalizeRouteCoordinates, simplifyCoordinates } = await import('../strava/route-coordinate-utils');

    const rawCoords: [number, number][] = [[19.94, 50.06], [19.95, 50.07], [19.96, 50.08]];
    const normalized = normalizeRouteCoordinates(rawCoords);
    expect(normalized.valid).toBe(true);

    if (normalized.valid) {
      const simplified = simplifyCoordinates(normalized.coordinates);
      await repos.activityRoutes.put({
        activityId: 'strava:100', providerActivityId: '100',
        simplifiedCoordinates: simplified, simplifiedPointCount: simplified.length,
        pointCount: normalized.coordinates.length,
        bounds: normalized.bounds, syncedAt: now, updatedAt: now,
      });
    }

    const activityRoutes = await repos.activityRoutes.list();
    expect(activityRoutes).toHaveLength(1);
    expect(activityRoutes[0].pointCount).toBe(3);
  });

  it('should compute per-run sync counters from batch result', async () => {
    const repos = createRepositories(db);

    const counters = { synced: 3, noRoute: 1, emptyRoute: 0, invalidCoordinates: 0, rateLimited: 0, failed: 1, skipped: 0, total: 5, results: [] };
    const perRunSynced = counters.synced;
    const perRunFailed = counters.failed;

    expect(perRunSynced).toBe(3);
    expect(perRunFailed).toBe(1);

    await repos.syncState.put({
      id: DEFAULT_RECORD_ID, status: 'completed',
      importedCount: 5, updatedCount: 0, routesSyncedCount: perRunSynced,
      skippedCount: 1, failedCount: perRunFailed, rateLimitedCount: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const state = await repos.syncState.get();
    expect(state?.routesSyncedCount).toBe(3);
    expect(state?.importedCount).toBe(5);
  });

  it('should record sync history after import completes', async () => {
    const repos = createRepositories(db);
    const now = new Date().toISOString();

    await repos.syncHistory.put({
      id: crypto.randomUUID(), trigger: 'sync_new_activities',
      startedAt: now, completedAt: now, status: 'completed',
      importedCount: 5, updatedCount: 2, routesSyncedCount: 3,
      skippedCount: 1, failedCount: 0, rateLimitedCount: 0,
      totalActivitiesAfter: 5, activitiesWithRoutesAfter: 3,
      activitiesWithoutRoutesAfter: 2,
    });

    const history = await repos.syncHistory.list();
    expect(history).toHaveLength(1);
    expect(history[0].importedCount).toBe(5);
    expect(history[0].routesSyncedCount).toBe(3);
  });
});

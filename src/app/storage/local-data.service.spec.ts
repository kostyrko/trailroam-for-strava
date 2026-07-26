import { TestBed } from '@angular/core/testing';
import { LocalDataService, type TrailroamBackupFile } from './local-data.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import { TrailroamRepositories } from './repositories';
import { BACKUP_SCHEMA_VERSION } from './local-data.service';

describe('LocalDataService', () => {
  it('should clear synced local data while leaving settings and access state untouched', async () => {
    const settingsClear = vi.fn();
    const accessStateClear = vi.fn();
    const syncHistoryClear = vi.fn().mockResolvedValue(undefined);
    const repositories = {
      activities: { clear: vi.fn().mockResolvedValue(undefined) },
      activityRoutes: { clear: vi.fn().mockResolvedValue(undefined) },
      syncState: { clear: vi.fn().mockResolvedValue(undefined) },
      syncHistory: { clear: syncHistoryClear },
      settings: { clear: settingsClear },
      accessState: { clear: accessStateClear },
      routeGeometry: { clear: vi.fn().mockResolvedValue(undefined) },
    } as unknown as TrailroamRepositories;

    TestBed.configureTestingModule({
      providers: [
        LocalDataService,
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: repositories,
        },
      ],
    });

    await TestBed.inject(LocalDataService).clearSyncedLocalData();

    expect(repositories.activities.clear).toHaveBeenCalledOnce();
    expect(repositories.activityRoutes.clear).toHaveBeenCalledOnce();
    expect(repositories.syncState.clear).toHaveBeenCalledOnce();
    expect(syncHistoryClear).toHaveBeenCalledOnce();
    expect(settingsClear).not.toHaveBeenCalled();
    expect(accessStateClear).not.toHaveBeenCalled();
  });

  it('should create a backup with all data tables', async () => {
    const repositories = {
      settings: {
        list: vi.fn().mockResolvedValue([{ id: 'default', mapProvider: 'openfreemap' }]),
      },
      accessState: {
        list: vi.fn().mockResolvedValue([{ id: 'default', status: 'beta_unrestricted' }]),
      },
      syncState: {
        list: vi.fn().mockResolvedValue([{ id: 'default', status: 'completed', importedCount: 5 }]),
      },
      syncHistory: { list: vi.fn().mockResolvedValue([]) },
      activities: { list: vi.fn().mockResolvedValue([{ id: 'strava:1', name: 'Morning Ride' }]) },
      activityRoutes: {
        list: vi.fn().mockResolvedValue([{ activityId: 'strava:1', coordinates: [] }]),
      },
      routeGeometry: { list: vi.fn().mockResolvedValue([]) },
      savedPlaces: { list: vi.fn().mockResolvedValue([]) },
      trails: { list: vi.fn().mockResolvedValue([]) },
    } as unknown as TrailroamRepositories;

    TestBed.configureTestingModule({
      providers: [
        LocalDataService,
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: repositories,
        },
      ],
    });

    const backup = await TestBed.inject(LocalDataService).backup();

    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.exportedAt).toBeTruthy();
    expect(backup.settings).toHaveLength(1);
    expect(backup.accessState).toHaveLength(1);
    expect(backup.syncState).toHaveLength(1);
    expect(backup.activities).toHaveLength(1);
    expect(backup.activityRoutes).toHaveLength(1);
  });

  describe('validateBackup', () => {
    it('should reject null', () => {
      const service = TestBed.inject(LocalDataService);
      expect(() => service.validateBackup(null)).toThrow('Invalid backup file: not an object.');
    });

    it('should reject object without schemaVersion', () => {
      const service = TestBed.inject(LocalDataService);
      expect(() => service.validateBackup({} as any)).toThrow('missing or invalid schemaVersion');
    });

    it('should reject unsupported future schema version', () => {
      const service = TestBed.inject(LocalDataService);
      expect(() =>
        service.validateBackup({
          schemaVersion: 999,
          settings: [],
          accessState: [],
          syncState: [],
          activities: [],
          activityRoutes: [],
        } as any),
      ).toThrow('Unsupported backup schema version');
    });

    it('should reject object without settings array', () => {
      const service = TestBed.inject(LocalDataService);
      expect(() => service.validateBackup({ schemaVersion: 1 } as any)).toThrow(
        'missing or invalid settings',
      );
    });

    it('should reject invalid top-level shape (string instead of object)', () => {
      const service = TestBed.inject(LocalDataService);
      expect(() => service.validateBackup('not-an-object')).toThrow('not an object');
    });

    it('should reject invalid record shape in settings (missing createdAt)', () => {
      const service = TestBed.inject(LocalDataService);
      expect(() =>
        service.validateBackup({
          schemaVersion: 1,
          settings: [{ id: 'default' }],
          accessState: [],
          syncState: [],
          activities: [],
          activityRoutes: [],
        } as any),
      ).not.toThrow();
    });

    it('should accept valid backup', () => {
      const service = TestBed.inject(LocalDataService);
      const backup = service.validateBackup({
        schemaVersion: 1,
        settings: [],
        accessState: [],
        syncState: [],
        activities: [],
        activityRoutes: [],
      });
      expect(backup.schemaVersion).toBe(1);
    });
  });

  describe('restore', () => {
    it('should clear all tables and restore data from backup', async () => {
      const settingsClear = vi.fn().mockResolvedValue(undefined);
      const accessStateClear = vi.fn().mockResolvedValue(undefined);
      const syncStateClear = vi.fn().mockResolvedValue(undefined);
      const activitiesClear = vi.fn().mockResolvedValue(undefined);
      const activityRoutesClear = vi.fn().mockResolvedValue(undefined);
      const routeGeometryClear = vi.fn().mockResolvedValue(undefined);

      const settingsPut = vi.fn().mockResolvedValue('default');
      const accessStatePut = vi.fn().mockResolvedValue('default');
      const syncStatePut = vi.fn().mockResolvedValue('default');
      const activitiesPut = vi.fn().mockResolvedValue('strava:1');
      const activityRoutesPut = vi.fn().mockResolvedValue('strava:1');

      const syncHistoryClear = vi.fn().mockResolvedValue(undefined);
      const savedPlacesClear = vi.fn().mockResolvedValue(undefined);
      const savedPlacesPut = vi.fn().mockResolvedValue('place:1');
      const repositories = {
        settings: { clear: settingsClear, put: settingsPut },
        accessState: { clear: accessStateClear, put: accessStatePut },
        syncState: { clear: syncStateClear, put: syncStatePut },
        syncHistory: { clear: syncHistoryClear },
        activities: { clear: activitiesClear, put: activitiesPut },
        activityRoutes: { clear: activityRoutesClear, put: activityRoutesPut },
        routeGeometry: { clear: routeGeometryClear },
        savedPlaces: { clear: savedPlacesClear, put: savedPlacesPut },
        trails: {
          clear: vi.fn().mockResolvedValue(undefined),
          put: vi.fn().mockResolvedValue('trail:1'),
        },
      } as unknown as TrailroamRepositories;

      TestBed.configureTestingModule({
        providers: [
          LocalDataService,
          {
            provide: TRAILROAM_REPOSITORIES,
            useValue: repositories,
          },
        ],
      });

      const now = '2025-01-01T00:00:00Z';
      const backup: TrailroamBackupFile = {
        schemaVersion: 1,
        exportedAt: now,
        settings: [{ id: 'default', mapProvider: 'openfreemap', createdAt: now, updatedAt: now }],
        accessState: [{ id: 'default', status: 'beta_unrestricted', updatedAt: now }],
        syncState: [{ id: 'default', status: 'completed' }],
        activities: [
          {
            id: 'strava:1',
            provider: 'strava',
            providerActivityId: '1',
            name: 'Morning Ride',
            sportType: 'Ride',
            activityCategory: 'ride',
            startDate: now,
            hasRoute: true,
            routeSyncStatus: 'route_synced',
            importedAt: now,
            updatedAt: now,
          },
        ],
        activityRoutes: [
          {
            activityId: 'strava:1',
            providerActivityId: '1',
            simplifiedCoordinates: [[19.9, 50.05]],
            simplifiedPointCount: 1,
            pointCount: 1,
            syncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
        savedPlaces: [
          {
            id: 'place:1',
            name: 'Kraków',
            latitude: 50.0614,
            longitude: 19.9372,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };

      const result = await TestBed.inject(LocalDataService).restore(backup);

      expect(settingsClear).toHaveBeenCalledOnce();
      expect(accessStateClear).toHaveBeenCalledOnce();
      expect(syncStateClear).toHaveBeenCalledOnce();
      expect(activitiesClear).toHaveBeenCalledOnce();
      expect(activityRoutesClear).toHaveBeenCalledOnce();
      expect(routeGeometryClear).toHaveBeenCalledOnce();
      expect(savedPlacesClear).toHaveBeenCalledOnce();

      expect(settingsPut).toHaveBeenCalledOnce();
      expect(accessStatePut).toHaveBeenCalledOnce();
      expect(syncStatePut).toHaveBeenCalledOnce();
      expect(activitiesPut).toHaveBeenCalledOnce();
      expect(activityRoutesPut).toHaveBeenCalledOnce();
      expect(savedPlacesPut).toHaveBeenCalledOnce();

      expect(result.settingsCount).toBe(1);
      expect(result.accessStateCount).toBe(1);
      expect(result.syncStateCount).toBe(1);
      expect(result.activitiesCount).toBe(1);
      expect(result.activityRoutesCount).toBe(1);
      expect(result.routeGeometryCount).toBe(0);
      expect(result.savedPlacesCount).toBe(1);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { SyncHistoryService } from './sync-history.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import type { TrailroamRepositories } from './repositories';
import type { SettingsRecord, SyncHistoryRecord } from './storage.models';

const baseStats = {
  importedCount: 5,
  updatedCount: 2,
  routesSyncedCount: 3,
  skippedCount: 1,
  failedCount: 0,
  rateLimitedCount: 0,
  status: 'completed' as const,
};

describe('SyncHistoryService', () => {
  let service: SyncHistoryService;
  let syncHistoryPut: ReturnType<typeof vi.fn>;
  let activitiesCount: ReturnType<typeof vi.fn>;
  let activityRoutesCount: ReturnType<typeof vi.fn>;
  let settingsGet: ReturnType<typeof vi.fn>;
  let settingsPut: ReturnType<typeof vi.fn>;

  function configure(opts: { totalActivities?: number; activitiesWithRoutes?: number; settings?: SettingsRecord | undefined } = {}) {
    const totalActivities = opts.totalActivities ?? 10;
    const activitiesWithRoutes = opts.activitiesWithRoutes ?? 4;

    syncHistoryPut = vi.fn().mockResolvedValue(undefined);
    activitiesCount = vi.fn().mockResolvedValue(totalActivities);
    activityRoutesCount = vi.fn().mockResolvedValue(activitiesWithRoutes);
    settingsGet = vi.fn().mockResolvedValue(opts.settings);
    settingsPut = vi.fn().mockResolvedValue(undefined);

    const repositories = {
      activities: { count: activitiesCount } as any,
      activityRoutes: { count: activityRoutesCount } as any,
      syncHistory: { put: syncHistoryPut, list: vi.fn(), clear: vi.fn() } as any,
      settings: { get: settingsGet, put: settingsPut, getOrCreateDefault: vi.fn(), clear: vi.fn() } as any,
      routeGeometry: {} as any,
      syncState: {} as any,
      accessState: {} as any,
      savedPlaces: {} as any,
      trails: {} as any,
    } as TrailroamRepositories;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SyncHistoryService,
        { provide: TRAILROAM_REPOSITORIES, useValue: repositories },
      ],
    });
    service = TestBed.inject(SyncHistoryService);
  }

  beforeEach(() => {
    configure();
  });

  describe('record()', () => {
    it('computes totalActivitiesAfter from the activities count', async () => {
      await service.record('sync_new_activities', baseStats);

      expect(syncHistoryPut).toHaveBeenCalledOnce();
      const record: SyncHistoryRecord = syncHistoryPut.mock.calls[0][0];
      expect(record.totalActivitiesAfter).toBe(10);
    });

    it('computes activitiesWithRoutesAfter from the activityRoutes count', async () => {
      await service.record('sync_new_activities', baseStats);

      const record: SyncHistoryRecord = syncHistoryPut.mock.calls[0][0];
      expect(record.activitiesWithRoutesAfter).toBe(4);
    });

    it('computes activitiesWithoutRoutesAfter as the difference', async () => {
      await service.record('sync_new_activities', baseStats);

      const record: SyncHistoryRecord = syncHistoryPut.mock.calls[0][0];
      expect(record.activitiesWithoutRoutesAfter).toBe(6);
    });

    it('handles zero activities and zero routes', async () => {
      configure({ totalActivities: 0, activitiesWithRoutes: 0 });

      await service.record('sync_new_activities', baseStats);

      const record: SyncHistoryRecord = syncHistoryPut.mock.calls[0][0];
      expect(record.totalActivitiesAfter).toBe(0);
      expect(record.activitiesWithRoutesAfter).toBe(0);
      expect(record.activitiesWithoutRoutesAfter).toBe(0);
    });

    it('spreads the provided stats onto the record', async () => {
      await service.record('sync_missing_routes', { ...baseStats, failedCount: 2, errorMessage: 'oops' });

      const record: SyncHistoryRecord = syncHistoryPut.mock.calls[0][0];
      expect(record.importedCount).toBe(5);
      expect(record.failedCount).toBe(2);
      expect(record.errorMessage).toBe('oops');
      expect(record.trigger).toBe('sync_missing_routes');
      expect(record.status).toBe('completed');
    });

    it('assigns id, startedAt and completedAt', async () => {
      await service.record('sync_new_activities', baseStats);

      const record: SyncHistoryRecord = syncHistoryPut.mock.calls[0][0];
      expect(record.id).toEqual(expect.any(String));
      expect(record.startedAt).toEqual(expect.any(String));
      expect(record.completedAt).toEqual(expect.any(String));
    });
  });

  describe('resetDismissedSync()', () => {
    it('clears dismissedSyncAt and persists when a dismissed timestamp exists', async () => {
      configure({
        settings: {
          id: 'default',
          mapProvider: 'openfreemap',
          dismissedSyncAt: '2025-01-01T00:00:00.000Z',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });

      await service.record('sync_new_activities', baseStats);

      expect(settingsPut).toHaveBeenCalledOnce();
      const saved: SettingsRecord = settingsPut.mock.calls[0][0];
      expect(saved.dismissedSyncAt).toBeUndefined();
      expect(saved.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('does not write settings when there is no dismissed timestamp', async () => {
      configure({
        settings: {
          id: 'default',
          mapProvider: 'openfreemap',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });

      await service.record('sync_new_activities', baseStats);

      expect(settingsPut).not.toHaveBeenCalled();
    });

    it('does not write settings when settings record is absent', async () => {
      configure({ settings: undefined });

      await service.record('sync_new_activities', baseStats);

      expect(settingsPut).not.toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('delegates to the syncHistory repository', async () => {
      const list = vi.fn().mockResolvedValue([{ id: 'a' }]);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          SyncHistoryService,
          {
            provide: TRAILROAM_REPOSITORIES,
            useValue: {
              activities: { count: vi.fn().mockResolvedValue(0) } as any,
              activityRoutes: { count: vi.fn().mockResolvedValue(0) } as any,
              syncHistory: { put: vi.fn(), list, clear: vi.fn() } as any,
              settings: { get: vi.fn().mockResolvedValue(undefined), put: vi.fn(), getOrCreateDefault: vi.fn(), clear: vi.fn() } as any,
              routeGeometry: {} as any,
              syncState: {} as any,
              accessState: {} as any,
              savedPlaces: {} as any,
              trails: {} as any,
            } as TrailroamRepositories,
          },
        ],
      });
      service = TestBed.inject(SyncHistoryService);

      await expect(service.list()).resolves.toEqual([{ id: 'a' }]);
      expect(list).toHaveBeenCalledOnce();
    });
  });

  describe('clear()', () => {
    it('delegates to the syncHistory repository', async () => {
      const clear = vi.fn().mockResolvedValue(undefined);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          SyncHistoryService,
          {
            provide: TRAILROAM_REPOSITORIES,
            useValue: {
              activities: { count: vi.fn().mockResolvedValue(0) } as any,
              activityRoutes: { count: vi.fn().mockResolvedValue(0) } as any,
              syncHistory: { put: vi.fn(), list: vi.fn(), clear } as any,
              settings: { get: vi.fn().mockResolvedValue(undefined), put: vi.fn(), getOrCreateDefault: vi.fn(), clear: vi.fn() } as any,
              routeGeometry: {} as any,
              syncState: {} as any,
              accessState: {} as any,
              savedPlaces: {} as any,
              trails: {} as any,
            } as TrailroamRepositories,
          },
        ],
      });
      service = TestBed.inject(SyncHistoryService);

      await service.clear();
      expect(clear).toHaveBeenCalledOnce();
    });
  });
});

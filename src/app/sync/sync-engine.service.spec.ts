import { TestBed } from '@angular/core/testing';
import { SyncEngineService, type SyncNewResult } from './sync-engine.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { StravaSessionService } from '../strava/strava-session.service';
import { StravaActivityNormalizer } from '../strava/strava-activity-normalizer';
import { RouteSyncService } from '../storage/route-sync.service';

function createMockRepositories(overrides: { activities?: any; activityRoutes?: any; routeGeometry?: any; syncState?: any; syncHistory?: any; settings?: any; accessState?: any } = {}) {
  return {
    activities: {
      list: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
      countWithRouteSyncStatus: vi.fn().mockResolvedValue(0),
      updateRouteSyncStatus: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue({ inserted: true, activity: {} }),
      ...overrides.activities,
    },
    activityRoutes: { upsert: vi.fn().mockResolvedValue({ inserted: true }), list: vi.fn().mockResolvedValue([]), put: vi.fn(), get: vi.fn(), clear: vi.fn(), delete: vi.fn() },
    routeGeometry: { get: vi.fn(), put: vi.fn(), clear: vi.fn() },
    syncState: { put: vi.fn(), get: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
    syncHistory: { put: vi.fn(), list: vi.fn(), clear: vi.fn() },
    settings: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() },
    accessState: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() },
    ...overrides,
  };
}

function configure(
  checkSession: () => any = () => 'logged_in',
  fetchActivityList: any = vi.fn().mockResolvedValue({ success: true, activities: [] }),
  fetchActivityRoute: any = vi.fn().mockResolvedValue({ success: true, coordinates: [[19.9, 50.05]] }),
  overrides: Record<string, any> = {},
  routeSyncMock: any = { syncRoute: vi.fn().mockResolvedValue({ routeStored: true, routeSyncStatus: 'route_synced', route: null }), syncRoutesBatch: vi.fn().mockResolvedValue({ synced: 2, noRoute: 0, emptyRoute: 0, invalidCoordinates: 0, rateLimited: 0, failed: 0, skipped: 0, total: 2, results: [] }) },
): SyncEngineService {
  TestBed.configureTestingModule({
    providers: [
      SyncEngineService,
      { provide: TRAILROAM_REPOSITORIES, useValue: createMockRepositories(overrides) },
      { provide: StravaSessionService, useValue: { checkSession, fetchActivityList, fetchActivityRoute } },
      { provide: StravaActivityNormalizer, useValue: { normalize: (raw: any) => ({ id: 'strava:' + raw.id, provider: 'strava', providerActivityId: String(raw.id), name: raw.name || 'Test', sportType: 'Ride', activityCategory: 'ride', startDate: '2024-01-01', hasRoute: false, routeSyncStatus: 'not_attempted', importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) } },
      { provide: RouteSyncService, useValue: routeSyncMock },
    ],
  });
  return TestBed.inject(SyncEngineService);
}

describe('SyncEngineService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    const service = configure();
    expect(service).toBeTruthy();
  });

  it('should set progress to idle initially', () => {
    const service = configure();
    expect(service.progress().phase).toBe('idle');
  });

  it('should cancel sync when cancel() is called before starting', async () => {
    const fetchList = vi.fn().mockResolvedValue({ success: true, activities: [{ id: 1, name: 'Ride', sport_type: 'Ride', start_date: '2024-01-01', start_date_local: '2024-01-01', distance: 10000, moving_time: 3600, elapsed_time: 3800 }] });
    const service = configure(() => 'logged_in', fetchList);
    service.cancel();
    const result = await service.syncNewActivities();
    expect(result.errorMessage).toBe('Cancelled');
  });

  it('should return routesSyncedCount as per-run count, not total DB count', async () => {
    const batchResult = { synced: 3, noRoute: 0, emptyRoute: 0, invalidCoordinates: 0, rateLimited: 0, failed: 0, skipped: 0, total: 3, results: [] };
    const syncRoutesBatch = vi.fn().mockResolvedValue(batchResult);
    const routeSyncMock = { syncRoute: vi.fn(), syncRoutesBatch };
    const service = configure(
      () => 'logged_in',
      vi.fn().mockResolvedValue({ success: true, activities: [{ id: 1, sport_type: 'Ride', start_date: '2024-01-01', start_date_local: '2024-01-01', distance: 10000, moving_time: 3600, elapsed_time: 3800 }] }),
      vi.fn().mockResolvedValue({ success: true, coordinates: [[19.9, 50.05]] }),
      { activities: { list: vi.fn().mockResolvedValue([{ id: 'strava:1', provider: 'strava', routeSyncStatus: 'not_attempted', providerActivityId: '1' }]), countWithRouteSyncStatus: vi.fn().mockResolvedValue(50), put: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(undefined) } },
      routeSyncMock,
    );

    const result = await service.syncNewActivities();
    expect(result.routesSyncedCount).toBe(3);
    expect(result.routesSyncedCount).not.toBe(50);
  });

  it('should report fetch failure on activity page load error', async () => {
    const service = configure(
      () => 'logged_in',
      vi.fn().mockResolvedValue({ success: false, errorCode: 'ACTIVITY_LIST_FETCH_FAILED', status: 'logged_in' }),
    );
    const result = await service.syncNewActivities();
    expect(result.errorMessage).toContain('Failed to fetch page');
    expect(result.failedCount).toBeGreaterThan(0);
  });

  it('should handle rate limiting in route sync', async () => {
    const batchResult = { synced: 1, noRoute: 0, emptyRoute: 0, invalidCoordinates: 0, rateLimited: 1, failed: 0, skipped: 0, total: 2, results: [] };
    const syncRoutesBatch = vi.fn().mockResolvedValue(batchResult);
    const routeSyncMock = { syncRoute: vi.fn(), syncRoutesBatch };
    const service = configure(
      () => 'logged_in',
      vi.fn().mockResolvedValue({ success: true, activities: [{ id: 1, name: 'Ride', sport_type: 'Ride', start_date: '2024-01-01', start_date_local: '2024-01-01', distance: 10000, moving_time: 3600, elapsed_time: 3800 }] }),
      vi.fn().mockResolvedValue({ success: true, coordinates: [[19.9, 50.05]] }),
      { activities: { list: vi.fn().mockResolvedValue([{ id: 'strava:1', provider: 'strava', routeSyncStatus: 'not_attempted', providerActivityId: '1' }]), put: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(undefined) } },
      routeSyncMock,
    );

    const result = await service.syncNewActivities();
    expect(result.rateLimitedCount).toBe(1);
  });

  it('should return Strava login required when not logged in', async () => {
    const service = configure(() => 'login_required');
    const result = await service.syncNewActivities();
    expect(result.errorMessage).toBe('Strava login required');
  });
});

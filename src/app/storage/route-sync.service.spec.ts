import { TestBed } from '@angular/core/testing';
import { RouteSyncService } from './route-sync.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import type { TrailroamRepositories } from './repositories';
import type { RouteFetchResult } from '../strava/strava-session.service';

function createMockRepositories(
  overrides: Partial<TrailroamRepositories> = {},
): TrailroamRepositories {
  return {
    activities: { put: vi.fn(), get: vi.fn(), list: vi.fn(), clear: vi.fn(), upsert: vi.fn(), updateRouteSyncStatus: vi.fn() } as any,
    activityRoutes: { put: vi.fn(), get: vi.fn(), list: vi.fn(), clear: vi.fn(), upsert: vi.fn() } as any,
    syncState: { put: vi.fn(), get: vi.fn(), clear: vi.fn() } as any,
    syncHistory: { put: vi.fn(), list: vi.fn(), clear: vi.fn() } as any,
    settings: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() } as any,
    accessState: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() } as any,
    ...overrides,
  };
}

describe('RouteSyncService', () => {
  let service: RouteSyncService;
  let activityRoutesUpsert: ReturnType<typeof vi.fn>;
  let updateRouteSyncStatus: ReturnType<typeof vi.fn>;

  function configure(): void {
    activityRoutesUpsert = vi.fn().mockResolvedValue({
      inserted: true,
      route: { activityId: 'strava:100', coordinates: [[19.94, 50.06], [19.95, 50.07]], pointCount: 2 },
    });
    updateRouteSyncStatus = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        RouteSyncService,
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories({
            activities: { put: vi.fn(), get: vi.fn(), list: vi.fn(), clear: vi.fn(), upsert: vi.fn(), updateRouteSyncStatus } as any,
            activityRoutes: { put: vi.fn(), get: vi.fn(), list: vi.fn(), clear: vi.fn(), upsert: activityRoutesUpsert } as any,
          }),
        },
      ],
    });

    service = TestBed.inject(RouteSyncService);
  }

  beforeEach(() => {
    configure();
  });

  it('should store route and update status to route_synced on successful fetch', async () => {
    const fetchResult: RouteFetchResult = {
      success: true,
      latlng: [[19.94, 50.06], [19.95, 50.07]],
    };

    const result = await service.syncRoute('strava:100', '100', fetchResult);

    expect(result.routeStored).toBe(true);
    expect(result.routeSyncStatus).toBe('route_synced');
    expect(result.route).not.toBeNull();
    expect(activityRoutesUpsert).toHaveBeenCalledOnce();
    expect(updateRouteSyncStatus).toHaveBeenCalledWith('strava:100', true, 'route_synced');
  });

  it('should set status to no_route when fetch returns NO_GPS_ROUTE', async () => {
    const fetchResult: RouteFetchResult = { success: false, errorCode: 'NO_GPS_ROUTE' };

    const result = await service.syncRoute('strava:100', '100', fetchResult);

    expect(result.routeStored).toBe(false);
    expect(result.routeSyncStatus).toBe('no_route');
    expect(activityRoutesUpsert).not.toHaveBeenCalled();
    expect(updateRouteSyncStatus).toHaveBeenCalledWith('strava:100', false, 'no_route');
  });

  it('should set status to empty_route when coordinates array is empty', async () => {
    const fetchResult: RouteFetchResult = { success: true, latlng: [] };

    const result = await service.syncRoute('strava:100', '100', fetchResult);

    expect(result.routeStored).toBe(false);
    expect(result.routeSyncStatus).toBe('empty_route');
    expect(activityRoutesUpsert).not.toHaveBeenCalled();
    expect(updateRouteSyncStatus).toHaveBeenCalledWith('strava:100', false, 'empty_route');
  });

  it('should set status to invalid_coordinates when too few valid points', async () => {
    const fetchResult: RouteFetchResult = { success: true, latlng: [[19.94, 50.06]] };

    const result = await service.syncRoute('strava:100', '100', fetchResult);

    expect(result.routeStored).toBe(false);
    expect(result.routeSyncStatus).toBe('invalid_coordinates');
    expect(activityRoutesUpsert).not.toHaveBeenCalled();
    expect(updateRouteSyncStatus).toHaveBeenCalledWith('strava:100', false, 'invalid_coordinates');
  });

  it('should set status to route_failed on fetch failure', async () => {
    const fetchResult: RouteFetchResult = { success: false, errorCode: 'ACTIVITY_ROUTE_FETCH_FAILED' };

    const result = await service.syncRoute('strava:100', '100', fetchResult);

    expect(result.routeStored).toBe(false);
    expect(result.routeSyncStatus).toBe('route_failed');
    expect(updateRouteSyncStatus).toHaveBeenCalledWith('strava:100', false, 'route_failed');
  });

  it('should set status to route_failed on STRAVA_LOGIN_REQUIRED', async () => {
    const fetchResult: RouteFetchResult = { success: false, errorCode: 'STRAVA_LOGIN_REQUIRED' };

    const result = await service.syncRoute('strava:100', '100', fetchResult);

    expect(result.routeStored).toBe(false);
    expect(result.routeSyncStatus).toBe('route_failed');
    expect(updateRouteSyncStatus).toHaveBeenCalledWith('strava:100', false, 'route_failed');
  });

  it('should set status to rate_limited on STRAVA_RATE_LIMITED', async () => {
    const fetchResult: RouteFetchResult = { success: false, errorCode: 'STRAVA_RATE_LIMITED', retryAfterSeconds: 60 };

    const result = await service.syncRoute('strava:100', '100', fetchResult);

    expect(result.routeStored).toBe(false);
    expect(result.routeSyncStatus).toBe('rate_limited');
    expect(activityRoutesUpsert).not.toHaveBeenCalled();
    expect(updateRouteSyncStatus).toHaveBeenCalledWith('strava:100', false, 'rate_limited');
  });

  describe('syncRoutesBatch', () => {
    it('should batch process multiple routes and return aggregate counts', async () => {
      const items = [
        { activityId: 'strava:1', providerActivityId: '1', fetchResult: { success: true, latlng: [[19.94, 50.06], [19.95, 50.07]] } as RouteFetchResult },
        { activityId: 'strava:2', providerActivityId: '2', fetchResult: { success: false, errorCode: 'NO_GPS_ROUTE' } as RouteFetchResult },
        { activityId: 'strava:3', providerActivityId: '3', fetchResult: { success: true, latlng: [[19.96, 50.08], [19.97, 50.09]] } as RouteFetchResult },
      ];

      const result = await service.syncRoutesBatch(items);

      expect(result.synced).toBe(2);
      expect(result.noRoute).toBe(1);
      expect(result.rateLimited).toBe(0);
      expect(result.total).toBe(3);
    });

    it('should count skipped items and skip their processing', async () => {
      const items = [
        { activityId: 'strava:1', providerActivityId: '1', fetchResult: { success: true, latlng: [[19.94, 50.06]] } as RouteFetchResult },
        { activityId: 'strava:2', providerActivityId: '2', fetchResult: { success: true, latlng: [[19.95, 50.07]] } as RouteFetchResult, skipReason: 'already_synced' },
        { activityId: 'strava:3', providerActivityId: '3', fetchResult: { success: true, latlng: [[19.96, 50.08], [19.97, 50.09]] } as RouteFetchResult },
      ];

      const result = await service.syncRoutesBatch(items);

      expect(result.skipped).toBe(1);
      expect(result.synced).toBe(1);
      expect(result.invalidCoordinates).toBe(1);
      expect(result.total).toBe(3);
    });

    it('should continue processing remaining items when one fails', async () => {
      activityRoutesUpsert
        .mockRejectedValueOnce(new Error('IndexedDB error'))
        .mockResolvedValueOnce({ inserted: true, route: { activityId: 'strava:2', pointCount: 2 } });

      const items = [
        { activityId: 'strava:1', providerActivityId: '1', fetchResult: { success: true, latlng: [[19.94, 50.06], [19.95, 50.07]] } as RouteFetchResult },
        { activityId: 'strava:2', providerActivityId: '2', fetchResult: { success: true, latlng: [[19.96, 50.08], [19.97, 50.09]] } as RouteFetchResult },
      ];

      const result = await service.syncRoutesBatch(items);

      expect(result.failed).toBe(1);
      expect(result.synced).toBe(1);
      expect(result.total).toBe(2);
    });

    it('should count rate_limited items separately', async () => {
      const items = [
        { activityId: 'strava:1', providerActivityId: '1', fetchResult: { success: true, latlng: [[19.94, 50.06], [19.95, 50.07]] } as RouteFetchResult },
        { activityId: 'strava:2', providerActivityId: '2', fetchResult: { success: false, errorCode: 'STRAVA_RATE_LIMITED', retryAfterSeconds: 60 } as RouteFetchResult },
        { activityId: 'strava:3', providerActivityId: '3', fetchResult: { success: false, errorCode: 'NO_GPS_ROUTE' } as RouteFetchResult },
      ];

      const result = await service.syncRoutesBatch(items);

      expect(result.synced).toBe(1);
      expect(result.rateLimited).toBe(1);
      expect(result.noRoute).toBe(1);
      expect(result.total).toBe(3);
    });

    it('should handle empty batch gracefully', async () => {
      const result = await service.syncRoutesBatch([]);

      expect(result.total).toBe(0);
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });
});

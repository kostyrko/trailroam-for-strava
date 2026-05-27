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
});

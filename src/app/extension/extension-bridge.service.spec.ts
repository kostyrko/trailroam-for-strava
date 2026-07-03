import { TestBed } from '@angular/core/testing';
import { ExtensionBridgeService } from './extension-bridge.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { TRAILROAM_DATABASE } from '../storage/repositories/repositories.token';
import { StravaActivityNormalizer } from '../strava/strava-activity-normalizer';
import { StravaSessionService } from '../strava/strava-session.service';
import { StravaRouteNormalizer } from '../strava/strava-route-normalizer';
import { SyncHistoryService } from '../storage/sync-history.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import Dexie from 'dexie';

const mockRepositories = {
  activities: { list: vi.fn().mockResolvedValue([]), put: vi.fn(), get: vi.fn(), updateRouteSyncStatus: vi.fn(), clear: vi.fn(), count: vi.fn().mockResolvedValue(0) },
  activityRoutes: { put: vi.fn(), upsert: vi.fn(), get: vi.fn(), list: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), clear: vi.fn(), delete: vi.fn() },
  routeGeometry: { put: vi.fn(), get: vi.fn(), clear: vi.fn() },
  syncState: { put: vi.fn(), get: vi.fn(), clear: vi.fn() },
  syncHistory: { put: vi.fn(), list: vi.fn(), clear: vi.fn() },
  settings: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() },
  accessState: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() },
};

describe('ExtensionBridgeService', () => {
  let service: ExtensionBridgeService;
  let onSyncDone: any;
  let onSyncSummaryNeedsUpdate: any;
  let onLastSyncLabelNeedsUpdate: any;

  function configure(): void {
    onSyncDone = vi.fn();
    onSyncSummaryNeedsUpdate = vi.fn();
    onLastSyncLabelNeedsUpdate = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ExtensionBridgeService,
        { provide: TRAILROAM_REPOSITORIES, useValue: mockRepositories },
        { provide: TRAILROAM_DATABASE, useValue: {} as Dexie },
        { provide: StravaActivityNormalizer, useValue: { normalize: (raw: any) => ({ id: 'strava:' + raw.id, provider: 'strava', name: raw.name || 'Test', sportType: 'Ride', activityCategory: 'ride', startDate: '2024-01-01', hasRoute: false, routeSyncStatus: 'not_attempted', importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) } },
        { provide: StravaSessionService, useValue: { fetchActivityRoute: vi.fn().mockResolvedValue({ success: false, errorCode: 'NO_GPS_ROUTE' }) } },
        { provide: StravaRouteNormalizer, useValue: { normalize: vi.fn() } },
        { provide: SyncHistoryService, useValue: { record: vi.fn() } },
        { provide: DataRefreshService, useValue: { syncProgressLabel: { set: vi.fn() }, emitRefresh: vi.fn() } },
      ],
    });

    service = TestBed.inject(ExtensionBridgeService);
    service.init({ onSyncDone, onSyncSummaryNeedsUpdate, onLastSyncLabelNeedsUpdate });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should create and init with callbacks', () => {
    configure();
    expect(service).toBeTruthy();
  });

  it('should reset counters without error', () => {
    configure();
    expect(() => service.resetCounters()).not.toThrow();
  });

  it('should set pending history trigger', () => {
    configure();
    expect(() => service.setPendingHistoryTrigger('clear_and_resync')).not.toThrow();
  });

  it('should handle GET_SYNCED_IDS and return response', async () => {
    mockRepositories.activities.list.mockResolvedValue([
      { providerActivityId: '100', routeSyncStatus: 'route_synced' },
      { providerActivityId: '101', routeSyncStatus: 'not_attempted' },
    ]);

    let response: any = null;
    const sendResponse = vi.fn((r: any) => { response = r; });
    const c: any = (globalThis as any).chrome;
    const originalChrome = c;
    (globalThis as any).chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((handler: any) => {
            const result = handler({ type: 'TRAILROAM_GET_SYNCED_IDS' }, {}, sendResponse);
            expect(result).toBe(true);
          }),
        },
      },
    };

    configure();
    await new Promise((r) => setTimeout(r, 10));
    expect(sendResponse).toHaveBeenCalled();
    expect(response.syncedIds).toContain('100');

    (globalThis as any).chrome = originalChrome;
  });
});

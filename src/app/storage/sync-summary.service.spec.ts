import { TestBed } from '@angular/core/testing';
import { SyncSummaryService } from './sync-summary.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import { TrailroamRepositories } from './repositories';

function createMockRepositories(
  overrides: Partial<TrailroamRepositories> = {},
): TrailroamRepositories {
  return {
    activities: { put: vi.fn(), get: vi.fn(), list: vi.fn(), count: vi.fn().mockResolvedValue(0), clear: vi.fn(), upsert: vi.fn() } as any,
    activityRoutes: { put: vi.fn(), get: vi.fn(), list: vi.fn(), count: vi.fn().mockResolvedValue(0), clear: vi.fn() } as any,
    syncState: { put: vi.fn(), get: vi.fn(), clear: vi.fn() } as any,
    syncHistory: { put: vi.fn(), list: vi.fn(), clear: vi.fn() } as any,
    settings: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() } as any,
    accessState: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() } as any,
    ...overrides,
  };
}

describe('SyncSummaryService', () => {
  let service: SyncSummaryService;
  let mockRepositories: TrailroamRepositories;

  function configure(syncStateGet: () => any): void {
    mockRepositories = createMockRepositories({
      syncState: { put: vi.fn(), get: vi.fn().mockImplementation(syncStateGet), clear: vi.fn() } as any,
    });

    TestBed.configureTestingModule({
      providers: [
        SyncSummaryService,
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: mockRepositories,
        },
      ],
    });

    service = TestBed.inject(SyncSummaryService);
  }

  it('should return empty summary when no sync state exists', async () => {
    configure(() => undefined);
    const summary = await service.getSummary();

    expect(summary.hasResults).toBe(false);
    expect(summary.importedCount).toBe(0);
    expect(summary.updatedCount).toBe(0);
    expect(summary.routesSyncedCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    expect(summary.totalActivities).toBe(0);
    expect(summary.activitiesWithRoutes).toBe(0);
    expect(summary.activitiesWithoutRoutes).toBe(0);
    expect(summary.status).toBeNull();
  });

  it('should return summary with sync counts from completed sync', async () => {
    configure(() => ({
      id: 'default',
      status: 'completed',
      startedAt: '2026-05-01T10:00:00.000Z',
      completedAt: '2026-05-01T10:05:00.000Z',
      importedCount: 5,
      updatedCount: 2,
      routesSyncedCount: 3,
      skippedCount: 1,
      failedCount: 0,
    }));

    const summary = await service.getSummary();

    expect(summary.hasResults).toBe(true);
    expect(summary.totalActivities).toBe(0);
    expect(summary.activitiesWithRoutes).toBe(0);
    expect(summary.activitiesWithoutRoutes).toBe(0);
    expect(summary.importedCount).toBe(5);
    expect(summary.updatedCount).toBe(2);
    expect(summary.routesSyncedCount).toBe(3);
    expect(summary.skippedCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(summary.status).toBe('completed');
    expect(summary.completedAt).toBe('2026-05-01T10:05:00.000Z');
  });

  it('should return summary with failed status when sync failed', async () => {
    configure(() => ({
      id: 'default',
      status: 'failed',
      importedCount: 3,
      updatedCount: 0,
      routesSyncedCount: 1,
      skippedCount: 2,
      failedCount: 1,
      lastErrorCode: 'ACTIVITY_ROUTE_FETCH_FAILED',
      lastErrorMessage: 'Failed to fetch route for activity 123',
    }));

    const summary = await service.getSummary();

    expect(summary.hasResults).toBe(true);
    expect(summary.totalActivities).toBe(0);
    expect(summary.activitiesWithRoutes).toBe(0);
    expect(summary.activitiesWithoutRoutes).toBe(0);
    expect(summary.status).toBe('failed');
    expect(summary.lastErrorCode).toBe('ACTIVITY_ROUTE_FETCH_FAILED');
    expect(summary.lastErrorMessage).toBe('Failed to fetch route for activity 123');
  });

  it('should include rateLimitedCount in summary', async () => {
    configure(() => ({
      id: 'default',
      status: 'completed',
      importedCount: 5,
      rateLimitedCount: 3,
    }));

    const summary = await service.getSummary();
    expect(summary.totalActivities).toBe(0);
    expect(summary.activitiesWithRoutes).toBe(0);
    expect(summary.activitiesWithoutRoutes).toBe(0);
    expect(summary.rateLimitedCount).toBe(3);
    expect(summary.hasResults).toBe(true);
  });

  it('should set status to null when sync is idle or in progress', async () => {
    configure(() => ({
      id: 'default',
      status: 'idle',
      importedCount: 10,
    }));

    const summary = await service.getSummary();
    expect(summary.totalActivities).toBe(0);
    expect(summary.activitiesWithRoutes).toBe(0);
    expect(summary.activitiesWithoutRoutes).toBe(0);
    expect(summary.status).toBeNull();
    expect(summary.hasResults).toBe(true);
  });

  it('should set hasResults to false when all counts are zero', async () => {
    configure(() => ({
      id: 'default',
      status: 'completed',
      importedCount: 0,
      updatedCount: 0,
      routesSyncedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      rateLimitedCount: 0,
    }));

    const summary = await service.getSummary();
    expect(summary.totalActivities).toBe(0);
    expect(summary.activitiesWithRoutes).toBe(0);
    expect(summary.activitiesWithoutRoutes).toBe(0);
    expect(summary.hasResults).toBe(false);
  });
});

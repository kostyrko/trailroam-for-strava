import { TestBed } from '@angular/core/testing';
import { ActivitiesPageComponent } from './activities-page.component';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import type { ActivityRecord } from '../storage/storage.models';

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
    hasRoute: true,
    routeSyncStatus: 'route_synced',
    importedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createMockRepositories(activities: ActivityRecord[], totalCount: number) {
  return {
    activities: {
      put: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockResolvedValue(activities),
      listPage: vi.fn().mockResolvedValue(activities),
      count: vi.fn().mockResolvedValue(totalCount),
      clear: vi.fn(),
      upsert: vi.fn(),
      updateRouteSyncStatus: vi.fn(),
      countWithRouteSyncStatus: vi.fn().mockResolvedValue(0),
    },
    activityRoutes: { put: vi.fn(), get: vi.fn(), list: vi.fn(), clear: vi.fn(), upsert: vi.fn() },
    syncState: { put: vi.fn(), get: vi.fn(), clear: vi.fn() },
    syncHistory: { put: vi.fn(), list: vi.fn(), clear: vi.fn() },
    settings: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() },
    accessState: { put: vi.fn(), get: vi.fn(), clear: vi.fn(), getOrCreateDefault: vi.fn() },
  };
}

describe('ActivitiesPageComponent', () => {
  it('should render loading state initially', () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state-kicker')?.textContent).toContain('Loading');
  });

  it('should render empty state when no activities exist', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories([], 0),
        },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state-kicker')?.textContent).toContain('No activities yet');
    expect(compiled.querySelector('.empty-state')?.textContent).toContain('Sync activities');
  });

  it('should render activities table when activities exist', async () => {
    const activities = [
      createActivity({ id: 'strava:1', name: 'Morning Ride', startDate: '2026-05-01T08:00:00Z', distanceMeters: 42000, movingTimeSeconds: 7200, activityCategory: 'ride', routeSyncStatus: 'route_synced' }),
      createActivity({ id: 'strava:2', name: 'Evening Hike', startDate: '2026-05-02T18:00:00Z', distanceMeters: 8000, movingTimeSeconds: 5400, activityCategory: 'walk', routeSyncStatus: 'no_route' }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories(activities, 2),
        },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.activities-table')).toBeTruthy();
    expect(compiled.querySelectorAll('.activity-row').length).toBe(2);

    const rows = compiled.querySelectorAll('.activity-row');
    expect(rows[0].textContent).toContain('Evening Hike');
    expect(rows[1].textContent).toContain('Morning Ride');

    expect(compiled.querySelector('.activities-count')?.textContent).toContain('2 activities');
  });

  it('should show pagination when more than PAGE_SIZE activities exist', async () => {
    const activities51 = Array.from({ length: 51 }, (_, i) =>
      createActivity({ id: `strava:${i + 1}`, name: `Activity ${i + 1}` }),
    );

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories(activities51, 51),
        },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.pagination')).toBeTruthy();
  });

  it('should render column headers', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories([createActivity()], 1),
        },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const headers = [...compiled.querySelectorAll('thead th')].map((h) => h.textContent?.trim());
    expect(headers).toEqual(['Date ▼', 'Name', 'Type', 'Distance', 'Speed', 'Time', 'Route', '']);
  });

  it('should show route badge for synced routes', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories([createActivity({ routeSyncStatus: 'route_synced' })], 1),
        },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.route-badge');
    expect(badge?.textContent).toContain('Route');
    expect(badge?.classList).toContain('route-ok');
  });

  it('should show route badge for activities without route', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories([createActivity({ routeSyncStatus: 'no_route' })], 1),
        },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.route-badge');
    expect(badge?.textContent).toContain('No route');
    expect(badge?.classList).not.toContain('route-ok');
  });

  it('should include all unique sport types from activities in the filter dropdown', async () => {
    const activities = [
      createActivity({ id: 'strava:1', sportType: 'Ride', activityCategory: 'ride' }),
      createActivity({ id: 'strava:2', sportType: 'Kayaking', activityCategory: 'paddling' }),
      createActivity({ id: 'strava:3', sportType: 'StandUpPaddling', activityCategory: 'paddling' }),
      createActivity({ id: 'strava:4', sportType: 'Ride', activityCategory: 'ride' }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        { provide: TRAILROAM_REPOSITORIES, useValue: createMockRepositories(activities, 4) },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const comp = fixture.componentInstance as any;
    const groups = comp.sportTypeGroups() as { category: string; sportTypes: string[] }[];

    expect(groups.length).toBeGreaterThan(0);

    const allSportTypes = groups.flatMap((g) => g.sportTypes);
    expect(allSportTypes).toContain('Ride');
    expect(allSportTypes).toContain('Kayaking');
    expect(allSportTypes).toContain('StandUpPaddling');
  });

  it('should not include hover preview popover', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories([createActivity({
            name: 'Sunset Trail Run',
            activityCategory: 'run',
            distanceMeters: 12000,
            movingTimeSeconds: 5400,
            routeSyncStatus: 'route_synced',
          })], 1),
        },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.preview-popover')).toBeFalsy();
  });

  it('should sort by date descending by default', async () => {
    const activities = [
      createActivity({ id: 'strava:1', name: 'Old Ride', startDate: '2025-01-01T08:00:00Z', activityCategory: 'ride' }),
      createActivity({ id: 'strava:2', name: 'New Ride', startDate: '2026-06-01T08:00:00Z', activityCategory: 'ride' }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        { provide: TRAILROAM_REPOSITORIES, useValue: createMockRepositories(activities, 2) },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.activity-row');
    expect(rows[0].textContent).toContain('New Ride');
    expect(rows[1].textContent).toContain('Old Ride');
  });

  it('should toggle sort direction when clicking same column', async () => {
    const activities = [
      createActivity({ id: 'strava:1', name: 'Alpha', startDate: '2026-01-01T08:00:00Z', activityCategory: 'ride' }),
      createActivity({ id: 'strava:2', name: 'Beta', startDate: '2026-06-01T08:00:00Z', activityCategory: 'ride' }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        { provide: TRAILROAM_REPOSITORIES, useValue: createMockRepositories(activities, 2) },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    const nameHeader = [...compiled.querySelectorAll('thead th')].find((h) => h.textContent?.trim().startsWith('Name'))! as HTMLElement;
    nameHeader.click();
    fixture.detectChanges();

    let rows = compiled.querySelectorAll('.activity-row');
    expect(rows[0].textContent).toContain('Alpha');
    expect(rows[1].textContent).toContain('Beta');

    nameHeader.click();
    fixture.detectChanges();

    rows = compiled.querySelectorAll('.activity-row');
    expect(rows[0].textContent).toContain('Beta');
    expect(rows[1].textContent).toContain('Alpha');
  });

  it('should sort by distance numerically', async () => {
    const activities = [
      createActivity({ id: 'strava:1', distanceMeters: 5000 }),
      createActivity({ id: 'strava:2', distanceMeters: 42000 }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        { provide: TRAILROAM_REPOSITORIES, useValue: createMockRepositories(activities, 2) },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const distanceHeader = [...fixture.nativeElement.querySelectorAll('thead th')].find((h) => h.textContent?.trim().startsWith('Distance'))! as HTMLElement;
    distanceHeader.click();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.activity-row');
    expect(rows[0].textContent).toContain('5.00 km');
    expect(rows[1].textContent).toContain('42.00 km');
  });
});

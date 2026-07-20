import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ActivitiesPageComponent } from './activities-page.component';
import {
  TRAILROAM_DATABASE,
  TRAILROAM_REPOSITORIES,
} from '../storage/repositories/repositories.token';
import type { ActivityRecord } from '../storage/storage.models';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

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
    savedPlaces: {
      list: vi.fn().mockResolvedValue([]),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      updateEditable: vi.fn(),
      updateCoordinates: vi.fn(),
      findByProviderId: vi.fn(),
      findWithinRadiusMeters: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      clear: vi.fn(),
    },
  };
}

function provideActivatedRoute(): {
  provide: typeof ActivatedRoute;
  useValue: { queryParamMap: import('rxjs').Observable<import('@angular/router').ParamMap> };
} {
  return {
    provide: ActivatedRoute,
    useValue: { queryParamMap: of(convertToParamMap({})) },
  };
}

function mockDatabaseProviders(): any[] {
  return [
    provideActivatedRoute(),
    {
      provide: TRAILROAM_DATABASE,
      useValue: { verno: 3, tables: [], open: vi.fn(), close: vi.fn(), delete: vi.fn() },
    },
  ];
}

describe('ActivitiesPageComponent', () => {
  it('should render loading state initially', () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [provideActivatedRoute()],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.loading-state')).toBeTruthy();
  });

  it('should render empty state when no activities exist', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
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
    expect(compiled.textContent).toContain('No activities yet');
    expect(compiled.querySelector('.empty-state')?.textContent).toContain('Sync activities');
  });

  it('should render activities table when activities exist', async () => {
    const activities = [
      createActivity({
        id: 'strava:1',
        name: 'Morning Ride',
        startDate: '2026-05-01T08:00:00Z',
        distanceMeters: 42000,
        movingTimeSeconds: 7200,
        activityCategory: 'ride',
        routeSyncStatus: 'route_synced',
      }),
      createActivity({
        id: 'strava:2',
        name: 'Evening Hike',
        startDate: '2026-05-02T18:00:00Z',
        distanceMeters: 8000,
        movingTimeSeconds: 5400,
        activityCategory: 'walk',
        routeSyncStatus: 'no_route',
      }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
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
        provideActivatedRoute(),
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
        provideActivatedRoute(),
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
    expect(headers).toEqual([
      '',
      'Date ▼',
      '',
      'Name',
      'Source',
      'Status',
      'Type',
      'Distance',
      'Speed',
      'Time',
      'Route',
      '',
    ]);
  });

  it('should show route badge for synced routes', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories(
            [createActivity({ routeSyncStatus: 'route_synced' })],
            1,
          ),
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
        provideActivatedRoute(),
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
      createActivity({
        id: 'strava:3',
        sportType: 'StandUpPaddling',
        activityCategory: 'paddling',
      }),
      createActivity({ id: 'strava:4', sportType: 'Ride', activityCategory: 'ride' }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
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

  it('should show table and filters when no activities exist (new empty state)', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
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

    // Table and filters should still be visible
    expect(compiled.querySelector('.activities-toolbar')).toBeTruthy();
    expect(compiled.querySelector('.stats-grid')).toBeTruthy();
    expect(compiled.querySelector('.activities-table')).toBeTruthy();
    expect(compiled.querySelector('.empty-state--no-activities')).toBeTruthy();
    expect(compiled.textContent).toContain('Sync activities');
  });

  it('should show no-match empty state when filters yield no results', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
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

    const searchInput = compiled.querySelector('.search-field__input') as HTMLInputElement;
    searchInput.value = '__NONEXISTENT__';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(compiled.textContent).toContain('No matching activities');
    expect(compiled.textContent).toContain('No matching activities');
  });

  it('should not include hover preview popover', async () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: createMockRepositories(
            [
              createActivity({
                name: 'Sunset Trail Run',
                activityCategory: 'run',
                distanceMeters: 12000,
                movingTimeSeconds: 5400,
                routeSyncStatus: 'route_synced',
              }),
            ],
            1,
          ),
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
      createActivity({
        id: 'strava:1',
        name: 'Old Ride',
        startDate: '2025-01-01T08:00:00Z',
        activityCategory: 'ride',
      }),
      createActivity({
        id: 'strava:2',
        name: 'New Ride',
        startDate: '2026-06-01T08:00:00Z',
        activityCategory: 'ride',
      }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
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
      createActivity({
        id: 'strava:1',
        name: 'Alpha',
        startDate: '2026-01-01T08:00:00Z',
        activityCategory: 'ride',
      }),
      createActivity({
        id: 'strava:2',
        name: 'Beta',
        startDate: '2026-06-01T08:00:00Z',
        activityCategory: 'ride',
      }),
    ];

    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        provideActivatedRoute(),
        { provide: TRAILROAM_REPOSITORIES, useValue: createMockRepositories(activities, 2) },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    const nameHeader = [...compiled.querySelectorAll('thead th')].find((h) =>
      h.textContent?.trim().startsWith('Name'),
    )! as HTMLElement;
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
        provideActivatedRoute(),
        { provide: TRAILROAM_REPOSITORIES, useValue: createMockRepositories(activities, 2) },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();

    const distanceHeader = [...fixture.nativeElement.querySelectorAll('thead th')].find((h) =>
      h.textContent?.trim().startsWith('Distance'),
    )! as HTMLElement;
    distanceHeader.click();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.activity-row');
    expect(rows[0].textContent).toContain('5.00 km');
    expect(rows[1].textContent).toContain('42.00 km');
  });
});

describe('ActivitiesPageComponent — Logbook tabs', () => {
  function createSavedPlace(
    id: string,
    name: string,
    createdAt: string,
  ): import('../storage/storage.models').SavedPlaceRecord {
    return {
      id,
      name,
      latitude: 50.0,
      longitude: 19.0,
      createdAt,
      updatedAt: createdAt,
    };
  }

  function setupWithPlaces(
    activities: import('../storage/storage.models').ActivityRecord[],
    places: import('../storage/storage.models').SavedPlaceRecord[],
    totalCount: number,
  ) {
    const repos = createMockRepositories(activities, totalCount);
    repos.savedPlaces.list = vi.fn().mockResolvedValue(places);
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [provideActivatedRoute(), { provide: TRAILROAM_REPOSITORIES, useValue: repos }],
    });
  }

  describe('filteredPlaces', () => {
    it('returns all places when search query is empty, sorted by date descending', async () => {
      const places = [
        createSavedPlace('place:1', 'Alpha', '2026-05-01T00:00:00.000Z'),
        createSavedPlace('place:2', 'Beta', '2026-06-01T00:00:00.000Z'),
      ];
      setupWithPlaces([], places, 0);

      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      const result: import('../storage/storage.models').SavedPlaceRecord[] = cmp.filteredPlaces();
      expect(result.map((p: any) => p.name)).toEqual(['Beta', 'Alpha']);
    });

    it('filters places by search query (name match)', async () => {
      const places = [
        createSavedPlace('place:1', 'Kraków Main Square', '2026-05-01T00:00:00.000Z'),
        createSavedPlace('place:2', 'Warsaw Old Town', '2026-06-01T00:00:00.000Z'),
      ];
      setupWithPlaces([], places, 0);

      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      cmp.placesSearchQuery.set('krak');
      const result: import('../storage/storage.models').SavedPlaceRecord[] = cmp.filteredPlaces();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Kraków Main Square');
    });

    it('filters places by search query (secondaryLabel match)', async () => {
      const places = [createSavedPlace('place:1', 'Main Square', '2026-05-01T00:00:00.000Z')];
      // Assign secondaryLabel via an override.
      places[0] = { ...places[0], secondaryLabel: 'Kraków, Poland' };
      setupWithPlaces([], places, 0);

      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      cmp.placesSearchQuery.set('poland');
      const result: import('../storage/storage.models').SavedPlaceRecord[] = cmp.filteredPlaces();
      expect(result).toHaveLength(1);
    });

    it('sorts by name ascending when onPlacesSort is toggled to name', async () => {
      const places = [
        createSavedPlace('place:1', 'Zoo', '2026-05-01T00:00:00.000Z'),
        createSavedPlace('place:2', 'Aquarium', '2026-06-01T00:00:00.000Z'),
      ];
      setupWithPlaces([], places, 0);

      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      cmp.onPlacesSort('name');
      let result: import('../storage/storage.models').SavedPlaceRecord[] = cmp.filteredPlaces();
      expect(result.map((p: any) => p.name)).toEqual(['Aquarium', 'Zoo']);

      // Toggle to descending
      cmp.onPlacesSort('name');
      result = cmp.filteredPlaces();
      expect(result.map((p: any) => p.name)).toEqual(['Zoo', 'Aquarium']);
    });
  });

  describe('allRows', () => {
    it('merges activities and places into a date-sorted list (newest first by default)', async () => {
      const activities = [
        createActivity({
          id: 'strava:1',
          name: 'Morning Ride',
          startDate: '2026-05-01T08:00:00Z',
        }),
      ];
      const places = [
        createSavedPlace('place:1', 'Old Place', '2026-04-01T00:00:00.000Z'),
        createSavedPlace('place:2', 'New Place', '2026-06-01T00:00:00.000Z'),
      ];
      setupWithPlaces(activities, places, 1);

      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      const rows: import('../activities/activities-page.component').AllLogbookRow[] = cmp.allRows();
      expect(rows).toHaveLength(3);
      // Newest first (date descending): New Place (Jun), Morning Ride (May), Old Place (Apr)
      expect(rows[0].kind).toBe('place');
      expect((rows[0] as any).place.name).toBe('New Place');
      expect(rows[1].kind).toBe('activity');
      expect((rows[1] as any).activity.name).toBe('Morning Ride');
      expect(rows[2].kind).toBe('place');
      expect((rows[2] as any).place.name).toBe('Old Place');
    });

    it('sorts merged list by name when onAllSort is toggled', async () => {
      const activities = [
        createActivity({ id: 'strava:1', name: 'Z Ride', startDate: '2026-05-01T08:00:00Z' }),
      ];
      const places = [createSavedPlace('place:1', 'Alpha Spot', '2026-06-01T00:00:00.000Z')];
      setupWithPlaces(activities, places, 1);

      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      cmp.onAllSort('name');
      const rows: import('../activities/activities-page.component').AllLogbookRow[] = cmp.allRows();
      expect(rows[0].kind).toBe('place');
      expect((rows[0] as any).place.name).toBe('Alpha Spot');
      expect(rows[1].kind).toBe('activity');
      expect((rows[1] as any).activity.name).toBe('Z Ride');
    });
  });

  describe('place actions', () => {
    it('onPlacesSortIndicator returns arrow for active column', async () => {
      setupWithPlaces([], [], 0);
      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      expect(cmp.placesSortIndicator('date')).toContain('▼');
      expect(cmp.placesSortIndicator('name')).toBe('');
    });

    it('onAllSortIndicator returns arrow for active column', async () => {
      setupWithPlaces([], [], 0);
      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const cmp = fixture.componentInstance as any;
      cmp.onAllSort('name');
      expect(cmp.allSortIndicator('name')).toContain('▲');
    });

    it('onSelectPlace navigates to /map with placeId and from params', async () => {
      const router = { navigate: vi.fn().mockResolvedValue(true) };
      const repos = createMockRepositories([], 0);
      repos.savedPlaces.list = vi.fn().mockResolvedValue([]);
      TestBed.configureTestingModule({
        imports: [ActivitiesPageComponent],
        providers: [
          provideActivatedRoute(),
          { provide: TRAILROAM_REPOSITORIES, useValue: repos },
          { provide: Router, useValue: router },
        ],
      });
      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const place = createSavedPlace('place:1', 'Test', '2026-05-01T00:00:00.000Z');
      const cmp = fixture.componentInstance as any;
      cmp.onSelectPlace(place, 'places');

      expect(router.navigate).toHaveBeenCalledWith(['/map'], {
        queryParams: { placeId: 'place:1', from: 'places' },
      });
    });

    it('onSelectPlace defaults from to places when not specified', async () => {
      const router = { navigate: vi.fn().mockResolvedValue(true) };
      const repos = createMockRepositories([], 0);
      repos.savedPlaces.list = vi.fn().mockResolvedValue([]);
      TestBed.configureTestingModule({
        imports: [ActivitiesPageComponent],
        providers: [
          provideActivatedRoute(),
          { provide: TRAILROAM_REPOSITORIES, useValue: repos },
          { provide: Router, useValue: router },
        ],
      });
      const fixture = TestBed.createComponent(ActivitiesPageComponent);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const place = createSavedPlace('place:2', 'Default', '2026-05-01T00:00:00.000Z');
      const cmp = fixture.componentInstance as any;
      cmp.onSelectPlace(place);

      expect(router.navigate).toHaveBeenCalledWith(['/map'], {
        queryParams: { placeId: 'place:2', from: 'places' },
      });
    });
  });
});

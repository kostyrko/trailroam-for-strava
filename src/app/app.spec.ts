import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
  ParamMap,
  withDisabledInitialNavigation,
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { App } from './app';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

beforeAll(() => {
  if (typeof document !== 'undefined') {
    const base = document.createElement('base');
    base.href = '/';
    if (!document.querySelector('base')) {
      document.head.appendChild(base);
    }
  }
});
import { ActivitiesPageComponent } from './activities/activities-page.component';
import { MapPage } from './map/map-page.component';
import { SettingsPage, routes } from './app.routes';
import { MapLibreService } from './map/maplibre.service';
import { RouteRendererService } from './map/route-renderer.service';
import { LocalDataService } from './storage/local-data.service';
import { TRAILROAM_REPOSITORIES } from './storage/repositories/repositories.token';
import { StravaActivityNormalizer } from './strava/strava-activity-normalizer';
import { ConfirmService } from './shared/confirm.service';
import { SyncHistoryService } from './storage/sync-history.service';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  function configureApp(
    syncStateGet: () => any = () => undefined,
    confirmMock = vi.fn(),
    activitiesCount = 0,
    routesCount = 0,
  ): void {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes, withDisabledInitialNavigation()),
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: {
            activities: {
              put: vi.fn(),
              get: vi.fn(),
              list: vi.fn(),
              count: vi.fn().mockResolvedValue(activitiesCount),
              clear: vi.fn(),
              upsert: vi.fn(),
            },
            activityRoutes: {
              put: vi.fn(),
              get: vi.fn(),
              list: vi.fn(),
              count: vi.fn().mockResolvedValue(routesCount),
              clear: vi.fn(),
            },
            routeGeometry: { list: vi.fn().mockResolvedValue([]), clear: vi.fn() },
            syncState: {
              put: vi.fn(),
              get: vi.fn().mockImplementation(syncStateGet),
              clear: vi.fn(),
            },
            syncHistory: { put: vi.fn(), list: vi.fn(), clear: vi.fn() },
            settings: {
              put: vi.fn(),
              get: vi.fn(),
              clear: vi.fn(),
              getOrCreateDefault: vi.fn().mockResolvedValue({
                id: 'default',
                mapProvider: 'openfreemap',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01',
              }),
            },
            accessState: {
              put: vi.fn(),
              get: vi.fn(),
              clear: vi.fn(),
              getOrCreateDefault: vi.fn(),
            },
          },
        },
        {
          provide: ConfirmService,
          useValue: { confirm: confirmMock },
        },
      ],
    });
  }

  it('should create the app', () => {
    configureApp();
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render primary navigation', async () => {
    configureApp();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = [...compiled.querySelectorAll('nav a')].map((link) => link.textContent?.trim());
    expect(links).toEqual(['Logbook', 'Map Explorer', 'Settings']);
  });

  it('should render header sync button', async () => {
    configureApp();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const syncButton = compiled.querySelector<HTMLButtonElement>('.sync-btn');

    expect(compiled.querySelector('.app-header__brand')?.textContent).toContain(
      'TrailRoam for Strava',
    );
    expect(compiled.querySelector('.app-header__actions')).toBeTruthy();
    expect(syncButton?.textContent).toContain('Sync Strava');
    expect(syncButton?.getAttribute('aria-haspopup')).toBe('menu');
  });

  describe('sync summary', () => {
    it('should not show sync summary when there are no results', async () => {
      configureApp(() => undefined);
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.sync-summary')).toBeFalsy();
    });

    it('should show sync summary when there are sync results', async () => {
      configureApp(
        () => ({
          id: 'default',
          status: 'completed',
          importedCount: 5,
          updatedCount: 2,
          routesSyncedCount: 3,
          skippedCount: 1,
          failedCount: 0,
        }),
        undefined,
        42,
        30,
      );
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const summary = fixture.nativeElement.querySelector('.sync-summary') as HTMLElement;
      expect(summary).toBeTruthy();
      expect(summary.textContent).toContain('Sync completed');
      expect(summary.textContent).toContain('Imported: 5');
      expect(summary.textContent).toContain('Updated: 2');
      expect(summary.textContent).toContain('No route: 1');
      expect(summary.textContent).not.toContain('Failed');
    });

    it('should dismiss sync summary when dismiss button is clicked', async () => {
      configureApp(() => ({
        id: 'default',
        status: 'completed',
        importedCount: 3,
        updatedCount: 0,
        routesSyncedCount: 1,
        skippedCount: 0,
        failedCount: 0,
      }));
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.sync-summary')).toBeTruthy();

      const dismissButton = fixture.nativeElement.querySelector(
        '.sync-summary-dismiss',
      ) as HTMLButtonElement;
      dismissButton.click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.sync-summary')).toBeFalsy();
    });

    it('should show error message in sync summary when sync failed', async () => {
      configureApp(() => ({
        id: 'default',
        status: 'failed',
        importedCount: 2,
        updatedCount: 0,
        routesSyncedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        lastErrorCode: 'ACTIVITY_ROUTE_FETCH_FAILED',
        lastErrorMessage: 'Failed to fetch route for activity 123',
      }));
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      const summary = fixture.nativeElement.querySelector('.sync-summary') as HTMLElement;
      expect(summary).toBeTruthy();
      expect(summary.textContent).toContain('Failed: 1');
      expect(summary.textContent).toContain('Error: Failed to fetch route for activity 123');
    });
  });
});

describe('ActivitiesPageComponent', () => {
  it('should render loading state initially', () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    });

    const fixture = TestBed.createComponent(ActivitiesPageComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.loading-state')).toBeTruthy();
  });
});

describe('MapPage', () => {
  let createMap: ReturnType<typeof vi.fn>;
  let onMapEvent: ReturnType<typeof vi.fn>;
  let renderRoutes: ReturnType<typeof vi.fn>;
  let selectRoute: ReturnType<typeof vi.fn>;
  let removeMap: ReturnType<typeof vi.fn>;

  const mockActivities = [
    {
      id: 'test:1',
      provider: 'strava' as const,
      providerActivityId: '1',
      name: 'Test Ride',
      sportType: 'Ride',
      activityCategory: 'ride' as const,
      startDate: '2024-01-01T00:00:00Z',
      distanceMeters: 10000,
      movingTimeSeconds: 1800,
      totalElevationGainMeters: 350,
      averageSpeedMetersPerSecond: 8.3,
      averageHeartrateBpm: 145,
      hasRoute: true,
      routeSyncStatus: 'route_synced' as const,
      sourceUrl: 'https://www.strava.com/activities/1',
      importedAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const mockRoutes = [
    {
      activityId: 'test:1',
      providerActivityId: '1',
      simplifiedCoordinates: [
        [19.9, 50.05],
        [19.91, 50.06],
      ] as [number, number][],
      simplifiedPointCount: 2,
      pointCount: 2,
      bounds: { west: 19.9, south: 50.05, east: 19.91, north: 50.06 },
      syncedAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  function configureMapPage(
    queryParams: Record<string, string> = {},
    activities = mockActivities,
    activityRoutes = mockRoutes,
  ): void {
    onMapEvent = vi.fn();
    renderRoutes = vi.fn();
    selectRoute = vi.fn();
    removeMap = vi.fn();
    createMap = vi.fn().mockResolvedValue({
      once: onMapEvent,
      on: vi.fn(),
      remove: removeMap,
      addControl: vi.fn(),
      isStyleLoaded: () => true,
      getSource: vi.fn().mockReturnValue(undefined),
    });

    TestBed.configureTestingModule({
      imports: [MapPage],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: Router,
          useValue: { navigate: vi.fn().mockResolvedValue(true) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap(queryParams)),
          },
        },
        {
          provide: MapLibreService,
          useValue: { createMap },
        },
        {
          provide: RouteRendererService,
          useValue: {
            renderRoutes,
            selectRoute,
            init: vi.fn(),
            fitToRoute: vi.fn(),
            updateRoutes: vi.fn(),
            deselectRoute: vi.fn(),
            clearHoverPoint: vi.fn(),
            showHoverPoint: vi.fn(),
            clearEmphasis: vi.fn(),
            setEmphasis: vi.fn(),
          },
        },
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: {
            activities: {
              list: vi.fn().mockResolvedValue(activities),
              count: vi.fn().mockResolvedValue(activities.length),
            },
            activityRoutes: {
              list: vi.fn().mockResolvedValue(activityRoutes),
            },
            routeGeometry: {
              list: vi.fn().mockResolvedValue([]),
              get: vi.fn().mockResolvedValue(undefined),
            },
            syncState: { get: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
            syncHistory: { put: vi.fn(), list: vi.fn(), clear: vi.fn() },
            settings: {
              get: vi.fn(),
              getOrCreateDefault: vi.fn().mockResolvedValue({
                id: 'default',
                mapProvider: 'openfreemap',
                mapExplorerPanelExpanded: true,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
              }),
            },
            accessState: { get: vi.fn() },
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
          },
        },
      ],
    });
  }

  it('should render map shell when no basemap error', async () => {
    configureMapPage();

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.map-page-layout')).toBeTruthy();
  });

  it('should set mapReady after ngAfterViewInit', async () => {
    configureMapPage();

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cmp = fixture.componentInstance as any;
    expect(cmp.mapReady()).toBe(true);
  });

  it('should update to basemap error state when showBasemapError is called', async () => {
    configureMapPage();

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const cmp = fixture.componentInstance as any;
    cmp.showBasemapError();
    fixture.detectChanges();

    expect(cmp.hasBasemapError()).toBe(true);
  });

  it('should select route and set selectedActivityId', async () => {
    configureMapPage();

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cmp = fixture.componentInstance as any;
    cmp.selectRoute({
      activityId: 'test:1',
      activity: mockActivities[0],
      route: mockRoutes[0],
      coordinates: mockRoutes[0].simplifiedCoordinates,
      name: 'Test Ride',
    });
    fixture.detectChanges();

    expect(cmp.selectedActivityId()).toBe('test:1');
  });

  it('should set basemap error from query param on init', () => {
    configureMapPage({ basemapError: 'true' });

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();

    const cmp = fixture.componentInstance as any;
    expect(cmp.hasBasemapError()).toBe(true);
  });

  it('should set selectedActivityId from query param', async () => {
    configureMapPage({ activityId: 'strava:999' });

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cmp = fixture.componentInstance as any;
    expect(cmp.selectedActivityId()).toBe('strava:999');
  });

  it('should clear selected route on clearSelectedActivity', async () => {
    configureMapPage();

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const cmp = fixture.componentInstance as any;
    cmp.selectRoute({
      activityId: 'test:1',
      activity: mockActivities[0],
      route: mockRoutes[0],
      coordinates: mockRoutes[0].simplifiedCoordinates,
      name: 'Test Ride',
    });
    fixture.detectChanges();
    expect(cmp.selectedActivityId()).toBe('test:1');

    cmp.clearSelectedActivity();
    fixture.detectChanges();

    expect(cmp.selectedRoute()).toBeNull();
    expect(cmp.noRouteActivity()).toBe(false);
  });

  it('should capture placeId from URL params into pendingPlaceId', async () => {
    configureMapPage({ placeId: 'place:1', from: 'places' });

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cmp = fixture.componentInstance as any;
    expect(cmp.pendingPlaceId()).toBe('place:1');
    expect(cmp.placeNavigationActive()).toBe(true);
  });
});

describe('SettingsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  let confirmMock: ReturnType<typeof vi.fn>;

  function configureSettingsPage(
    clearSyncedLocalData = vi.fn().mockResolvedValue(undefined),
    confirmResult = false,
  ): void {
    confirmMock = vi.fn().mockResolvedValue(confirmResult);
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        {
          provide: LocalDataService,
          useValue: {
            clearSyncedLocalData,
          },
        },
        {
          provide: ConfirmService,
          useValue: { confirm: confirmMock },
        },
        {
          provide: SyncHistoryService,
          useValue: {
            record: vi.fn().mockResolvedValue(undefined),
            list: vi.fn().mockResolvedValue([]),
            clear: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
  }

  it('should render clear synced local data action', () => {
    configureSettingsPage();

    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Clear synced local data');
    expect(compiled.textContent).toContain('Removes imported activities, routes, and sync state');
  });

  it('should ask for confirmation before clearing synced local data', async () => {
    const clearSyncedLocalData = vi.fn().mockResolvedValue(undefined);
    configureSettingsPage(clearSyncedLocalData, false);

    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      '.btn-danger',
    ) as unknown as HTMLButtonElement[];
    const clearButton = Array.from(buttons).find((b) =>
      b.textContent?.includes('Clear synced local data'),
    );
    clearButton?.click();
    await fixture.whenStable();

    expect(confirmMock).toHaveBeenCalledWith({
      title: 'Clear synced local data',
      message:
        'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
      confirmLabel: 'Clear data',
      danger: true,
    });
    expect(clearSyncedLocalData).not.toHaveBeenCalled();
  });

  it('should clear synced local data and update status after confirmation', async () => {
    const clearSyncedLocalData = vi.fn().mockResolvedValue(undefined);
    configureSettingsPage(clearSyncedLocalData, true);

    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      '.btn-danger',
    ) as unknown as HTMLButtonElement[];
    const clearButton = Array.from(buttons).find((b) =>
      b.textContent?.includes('Clear synced local data'),
    );
    clearButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(clearSyncedLocalData).toHaveBeenCalledOnce();
    const statusEl = compiled.querySelector('.clear-status');
    expect(statusEl).toBeTruthy();
    expect(statusEl?.textContent).toContain('cleared');
  });
});

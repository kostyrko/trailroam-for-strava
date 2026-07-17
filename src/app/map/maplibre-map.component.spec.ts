import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { type Map } from 'maplibre-gl';
import { OPENFREEMAP_BASEMAP_PROVIDER, type ResolvedBasemapProvider } from './basemap-provider';
import { BasemapProviderService } from './basemap-provider.service';
import { MapLibreMapComponent } from './maplibre-map.component';
import { MapLibreService } from './maplibre.service';
import { type MapRouteFeature } from './mock-routes';
import { RouteRendererService } from './route-renderer.service';

vi.mock('maplibre-gl', () => {
  const NavigationControl = vi.fn();
  const ScaleControl = vi.fn();
  return {
    default: { NavigationControl, ScaleControl },
    NavigationControl,
    ScaleControl,
  };
});

function makeMockRoute(overrides: Partial<MapRouteFeature> = {}): MapRouteFeature {
  return {
    activityId: 'test:1',
    activity: {
      id: 'test:1',
      provider: 'strava',
      providerActivityId: '1',
      name: 'Test Ride',
      sportType: 'Ride',
      activityCategory: 'ride',
      startDate: '2024-01-01T00:00:00Z',
      distanceMeters: 10000,
      movingTimeSeconds: 1800,
      elapsedTimeSeconds: 2000,
      totalElevationGainMeters: 350,
      hasRoute: true,
      routeSyncStatus: 'route_synced',
      sourceUrl: 'https://www.strava.com/activities/1',
      importedAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    route: {
      activityId: 'test:1',
      providerActivityId: '1',
      simplifiedCoordinates: [[19.9, 50.05], [19.91, 50.06]],
      simplifiedPointCount: 2,
      pointCount: 2,
      bounds: { west: 19.9, south: 50.05, east: 19.91, north: 50.06 },
      syncedAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    coordinates: [[19.9, 50.05], [19.91, 50.06]],
    name: 'Test Ride',
    ...overrides,
  };
}

describe('MapLibreMapComponent', () => {
  let createMap: ReturnType<typeof vi.fn>;
  let getSelectedProvider: ReturnType<typeof vi.fn>;
  let once: ReturnType<typeof vi.fn>;
  let renderRoutes: ReturnType<typeof vi.fn>;
  let selectRoute: ReturnType<typeof vi.fn>;
  let fitToRoute: ReturnType<typeof vi.fn>;
  let mapFlyTo: ReturnType<typeof vi.fn>;
  let mapFitBounds: ReturnType<typeof vi.fn>;
  let mapGetZoom: ReturnType<typeof vi.fn>;
  let mockRenderer: Record<string, any>;
  let remove: ReturnType<typeof vi.fn>;
  let resolvedProvider: ResolvedBasemapProvider;
  let fixture: ComponentFixture<MapLibreMapComponent>;

  beforeEach(() => {
    resolvedProvider = {
      config: OPENFREEMAP_BASEMAP_PROVIDER,
      style: OPENFREEMAP_BASEMAP_PROVIDER.styleUrl!,
    };
    getSelectedProvider = vi.fn().mockReturnValue(resolvedProvider);
    once = vi.fn();
    remove = vi.fn();
    renderRoutes = vi.fn();
    selectRoute = vi.fn();
    fitToRoute = vi.fn();
    mapFlyTo = vi.fn();
    mapFitBounds = vi.fn();
    mapGetZoom = vi.fn().mockReturnValue(8);
    mockRenderer = { renderRoutes, selectRoute, fitToRoute, init: vi.fn(), updateRoutes: vi.fn(), deselectRoute: vi.fn(), clearHoverPoint: vi.fn(), showHoverPoint: vi.fn(), clearEmphasis: vi.fn(), setEmphasis: vi.fn() };
    createMap = vi.fn().mockResolvedValue({
      once,
      on: vi.fn(),
      remove,
      addControl: vi.fn(),
      isStyleLoaded: () => true,
      getSource: vi.fn().mockReturnValue(undefined),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      setStyle: vi.fn(),
      flyTo: mapFlyTo,
      fitBounds: mapFitBounds,
      getZoom: mapGetZoom,
    } as unknown as Map);

    TestBed.configureTestingModule({
      imports: [MapLibreMapComponent],
      providers: [
        {
          provide: MapLibreService,
          useValue: { createMap },
        },
        {
          provide: BasemapProviderService,
          useValue: { getSelectedProvider },
        },
        {
          provide: RouteRendererService,
          useValue: mockRenderer,
        },
      ],
    });
  });

  it('should initialize MapLibre in the map container', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const container = fixture.nativeElement.querySelector('.map-container') as HTMLElement;
    expect(getSelectedProvider).toHaveBeenCalled();
    expect(createMap).toHaveBeenCalledWith(container, resolvedProvider);
  });

  it('should render routes and select activity via renderRouteFeatures', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const routes = [makeMockRoute()];
    fixture.componentInstance.renderRouteFeatures(routes, 'test:1');

    expect(renderRoutes).toHaveBeenCalledOnce();
    expect(selectRoute).toHaveBeenCalledWith('test:1');
    expect(fitToRoute).toHaveBeenCalledWith(routes[0].coordinates, routes[0].route.bounds);
  });

  it('should emit selected routes from the renderer callback', async () => {
    const routeSelected = vi.fn();
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.componentInstance.routeSelected.subscribe(routeSelected);
    fixture.detectChanges();
    await fixture.whenStable();

    const routes = [makeMockRoute()];
    fixture.componentInstance.renderRouteFeatures(routes);

    const rendererCallback = renderRoutes.mock.calls[0][1];
    rendererCallback(routes[0]);

    expect(routeSelected).toHaveBeenCalledWith(routes[0]);
  });

  it('should call fitToRoute via flyToBounds', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.flyToBounds([[19.9, 50.05], [19.91, 50.06]], { west: 19.9, south: 50.05, east: 19.91, north: 50.06 });

    expect(fitToRoute).toHaveBeenCalledWith([[19.9, 50.05], [19.91, 50.06]], { west: 19.9, south: 50.05, east: 19.91, north: 50.06 });
  });

  it('should ignore flyToBounds with empty coordinates', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.flyToBounds([]);

    expect(fitToRoute).not.toHaveBeenCalled();
  });

  it('should flyTo a center point using flyTo with a floor zoom of 13', async () => {
    mapGetZoom.mockReturnValue(8);
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.flyTo([19.945, 50.0647]);

    expect(mapFlyTo).toHaveBeenCalledWith({ center: [19.945, 50.0647], zoom: 13 });
    expect(mapFitBounds).not.toHaveBeenCalled();
  });

  it('should keep the current zoom in flyTo when already above 13', async () => {
    mapGetZoom.mockReturnValue(15);
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.flyTo([19.945, 50.0647]);

    expect(mapFlyTo).toHaveBeenCalledWith({ center: [19.945, 50.0647], zoom: 15 });
  });

  it('should fitBounds in flyTo when bounds are provided', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.flyTo([19.945, 50.0647], [19.79, 49.96, 20.21, 50.12]);

    expect(mapFitBounds).toHaveBeenCalledWith(
      [19.79, 49.96, 20.21, 50.12],
      { padding: 80, maxZoom: 15 },
    );
    expect(mapFlyTo).not.toHaveBeenCalled();
  });

  it('should queue flyTo into pendingReadyTasks when the map is not ready', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    // Call flyTo before the async createMap() resolves; mapInstance is still null, so
    // flyTo must defer into pendingReadyTasks instead of touching the map synchronously.
    fixture.componentInstance.flyTo([19.945, 50.0647]);
    expect(mapFlyTo).not.toHaveBeenCalled();

    // After the map loads, the queued task is drained and runs against the real instance.
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mapFlyTo).toHaveBeenCalledWith({ center: [19.945, 50.0647], zoom: 13 });
  });

  it('onSearchSelected routes a search result into fitBounds when bbox is present', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    // Open the popover via the button (public surface), then emit on the rendered child
    // panel's output to exercise the parent's protected onSearchSelected handler.
    const native: HTMLElement = fixture.nativeElement;
    (native.querySelector('.map-search-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const panelDebug = fixture.debugElement.query(By.css('app-map-search-panel'));
    const panel = panelDebug.componentInstance as { searchSelected: { emit: (v: unknown) => void } };
    panel.searchSelected.emit({
      result: { label: 'Kraków', center: [19.945, 50.0647], bbox: [19.79, 49.96, 20.21, 50.12] },
      kind: 'place',
    });

    expect(mapFitBounds).toHaveBeenCalledWith(
      [19.79, 49.96, 20.21, 50.12],
      { padding: 80, maxZoom: 15 },
    );
  });

  it('toggleSearchPanel shows and hides the search popover via the button', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const native: HTMLElement = fixture.nativeElement;
    const searchBtn = native.querySelector('.map-search-btn') as HTMLButtonElement;

    expect(native.querySelector('app-map-search-panel')).toBeNull();
    searchBtn.click();
    fixture.detectChanges();
    expect(native.querySelector('app-map-search-panel')).not.toBeNull();
    searchBtn.click();
    fixture.detectChanges();
    expect(native.querySelector('app-map-search-panel')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      coordinates: [[19.9, 50.05], [19.91, 50.06]],
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
  let mockRenderer: { renderRoutes: any; selectRoute: any; fitToRoute: any; init: any };
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
    mockRenderer = { renderRoutes, selectRoute, fitToRoute, init: vi.fn() };
    createMap = vi.fn().mockResolvedValue({
      once,
      on: vi.fn(),
      remove,
      addControl: vi.fn(),
      isStyleLoaded: () => true,
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
    expect(getSelectedProvider).toHaveBeenCalledOnce();
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
});

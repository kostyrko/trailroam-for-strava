import { type Map } from 'maplibre-gl';
import { type MapRouteFeature } from './mock-routes';
import type { RouteSelectedHandler } from './route-renderer.service';
import {
  ROUTES_LAYER_ID,
  ROUTES_SELECTED_LAYER_ID,
  ROUTES_SOURCE_ID,
  RouteRendererService,
} from './route-renderer.service';

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

describe('RouteRendererService', () => {
  let addLayer: ReturnType<typeof vi.fn>;
  let addSource: ReturnType<typeof vi.fn>;
  let fitBounds: ReturnType<typeof vi.fn>;
  let getCanvas: ReturnType<typeof vi.fn>;
  let getSource: ReturnType<typeof vi.fn>;
  let map: Map;
  let on: ReturnType<typeof vi.fn>;
  let once: ReturnType<typeof vi.fn>;
  let routeSelected: ReturnType<typeof vi.fn<RouteSelectedHandler>>;
  let setFilter: ReturnType<typeof vi.fn>;
  let service: RouteRendererService;

  const mockRoutes = [makeMockRoute({ activityId: 'test:1', name: 'Route 1' }), makeMockRoute({ activityId: 'test:2', name: 'Route 2' })];

  beforeEach(() => {
    addLayer = vi.fn();
    addSource = vi.fn();
    fitBounds = vi.fn();
    getCanvas = vi.fn().mockReturnValue({ style: { cursor: '' } });
    getSource = vi.fn().mockReturnValue(null);
    on = vi.fn();
    once = vi.fn();
    routeSelected = vi.fn<RouteSelectedHandler>();
    setFilter = vi.fn();
    map = {
      addLayer,
      addSource,
      fitBounds,
      getCanvas,
      getSource,
      on,
      once,
      setFilter,
      isStyleLoaded: () => true,
    } as unknown as Map;
    service = new RouteRendererService();
  });

  it('should render each route as a separate GeoJSON feature', () => {
    service.init(map);
    service.renderRoutes(mockRoutes, routeSelected);

    const routesCall = addSource.mock.calls.find(([id]) => id === ROUTES_SOURCE_ID);
    expect(routesCall).toBeDefined();
    expect(routesCall![1]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'FeatureCollection',
        }),
        type: 'geojson',
      }),
    );
  });

  it('should add route and selected-route layers', () => {
    service.init(map);
    service.renderRoutes(mockRoutes, routeSelected);

    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: ROUTES_LAYER_ID }));
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: ROUTES_SELECTED_LAYER_ID }));
  });

  it('should select and highlight the clicked route', () => {
    service.init(map);
    service.renderRoutes(mockRoutes, routeSelected);
    const clickHandler = on.mock.calls.find(
      ([eventName, layerId]) => eventName === 'click' && layerId === ROUTES_LAYER_ID,
    )?.[2];
    const route = mockRoutes[1];

    clickHandler({
      features: [
        {
          properties: {
            activityId: route.activityId,
          },
        },
      ],
    });

    expect(setFilter).toHaveBeenCalledWith(ROUTES_SELECTED_LAYER_ID, [
      '==',
      ['get', 'activityId'],
      route.activityId,
    ]);
    expect(routeSelected).toHaveBeenCalledWith(route);
  });

  describe('fitToRoute', () => {
    const coords: [number, number][] = [[19.9, 50.05], [19.91, 50.06]];

    it('returns false and is a no-op before init(map)', () => {
      expect(service.fitToRoute(coords)).toBe(false);
      expect(fitBounds).not.toHaveBeenCalled();
    });

    it('returns true and fits immediately when the style is loaded', () => {
      service.init(map);
      expect(service.fitToRoute(coords)).toBe(true);
      expect(fitBounds).toHaveBeenCalledTimes(1);
      expect(once).not.toHaveBeenCalled();
    });

    it('applies the snappy default duration when options is omitted', () => {
      service.init(map);
      service.fitToRoute(coords);

      const [, options] = fitBounds.mock.calls[0];
      expect(options).toEqual({ padding: 80, maxZoom: 15, duration: 600 });
    });

    it('lets an explicit duration override the default', () => {
      service.init(map);
      service.fitToRoute(coords, undefined, { duration: 1200 });

      expect(fitBounds.mock.calls[0][1]).toEqual({ padding: 80, maxZoom: 15, duration: 1200 });
    });

    it('applies the default duration when fitting precomputed bounds', () => {
      service.init(map);
      const bounds = { west: 19.9, south: 50.05, east: 19.91, north: 50.06 };
      service.fitToRoute(coords, bounds);

      const [bbox, options] = fitBounds.mock.calls[0];
      expect(bbox).toEqual([19.9, 50.05, 19.91, 50.06]);
      expect(options).toEqual({ padding: 80, maxZoom: 15, duration: 600 });
    });

    it('fits at most once when the style is not yet loaded', () => {
      vi.useFakeTimers();
      try {
        (map.isStyleLoaded as () => boolean) = () => false;
        const styleLoadHandlers: Array<() => void> = [];
        once.mockImplementation((_event: string, handler: () => void) => {
          styleLoadHandlers.push(handler);
        });

        service.init(map);
        expect(service.fitToRoute(coords)).toBe(true);
        // No immediate fit while the style is still loading.
        expect(fitBounds).not.toHaveBeenCalled();

        // Both the style.load handler and the 500ms fallback fire; fit runs once.
        styleLoadHandlers.forEach((h) => h());
        vi.advanceTimersByTime(500);
        expect(fitBounds).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
        (map.isStyleLoaded as () => boolean) = () => true;
      }
    });
  });
});

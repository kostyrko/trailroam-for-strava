import { type Map } from 'maplibre-gl';
import { type MapRouteFeature } from './mock-routes';
import type { RouteSelectedHandler } from './route-renderer.service';
import {
  ROUTES_LAYER_ID,
  ROUTES_SELECTED_LAYER_ID,
  ROUTES_SOURCE_ID,
  RouteRendererService,
} from './route-renderer.service';

/** Global lib `Map` type, unshadowed from the maplibre-gl `Map` imported above. */
type StageColorMap = globalThis.Map<string, string>;

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

  describe('per-stage trail colors (T-139)', () => {
    /** Shape of the route LineString features pushed into the routes source. */
    interface RouteFeatureProperties {
      activityId: string;
      name: string;
      category: string;
      emphasis: number;
      stageColor: string | null;
    }
    interface RouteFeature {
      type: 'Feature';
      properties: RouteFeatureProperties;
      geometry: { type: 'LineString'; coordinates: unknown };
    }

    /** Alias to avoid clashing with the maplibre-gl `Map` type imported above. */
    const StageColorMapCtor = globalThis.Map as unknown as new (
      entries?: readonly (readonly [string, string])[],
    ) => StageColorMap;

    /** Builds a stage-color map from entries without fighting the `Map` shadow. */
    function stageColorMap(entries: readonly (readonly [string, string])[]): StageColorMap {
      return new StageColorMapCtor(entries);
    }

    /**
     * Renders routes with the given stageColors and returns the features pushed
     * to the ROUTES source. Several sources get `setData` calls during a sync
     * (routes, centroids, heatmap); this picks the call whose features carry an
     * `activityId` property, which is unique to the routes source.
     */
    function captureFeatures(stageColors: StageColorMap | null): RouteFeature[] {
      const setData = vi.fn();
      getSource.mockReturnValue({ setData });
      service.init(map);
      service.renderRoutes(mockRoutes, routeSelected);
      const matchingIds = new Set(mockRoutes.map((r) => r.activityId));
      service.setEmphasis(matchingIds, null, stageColors);
      const routesCall = setData.mock.calls
        .map((c) => c[0] as { features: RouteFeature[] })
        .filter((data) =>
          // Routes-source LineStrings carry a `stageColor` property (the
          // heatmap source emits LineStrings with empty properties).
          data.features.some(
            (f) => f.geometry?.type === 'LineString' && 'stageColor' in (f.properties ?? {}),
          ),
        )
        .at(-1)!;
      return routesCall.features;
    }

    it('emits a stageColor property taken from the setEmphasis map', () => {
      const stageColors = stageColorMap([
        [mockRoutes[0].activityId, '#aaaaaaaa'],
        [mockRoutes[1].activityId, '#bbbbbbbb'],
      ]);
      const features = captureFeatures(stageColors);
      const first = features.find((f) => f.properties.activityId === mockRoutes[0].activityId)!;
      const second = features.find((f) => f.properties.activityId === mockRoutes[1].activityId)!;
      expect(first.properties.stageColor).toBe('#aaaaaaaa');
      expect(second.properties.stageColor).toBe('#bbbbbbbb');
    });

    it('falls back to null stageColor when no stage-color map is provided', () => {
      // Plain emphasis with no stageColors (e.g. filter/search highlight path).
      const features = captureFeatures(null);
      for (const f of features) {
        expect(f.properties.stageColor).toBeNull();
      }
    });

    it('clears stageColor on clearEmphasis', () => {
      const features = captureFeatures(
        stageColorMap([[mockRoutes[0].activityId, '#aaaaaaaa']]),
      );
      // clearEmphasis triggers a re-sync; capture the routes-source data pushed
      // afterwards (identified by features carrying an `activityId`).
      const setDataAfter = vi.fn();
      getSource.mockReturnValue({ setData: setDataAfter });
      service.clearEmphasis();
      const routesCall = setDataAfter.mock.calls
        .map((c) => c[0] as { features: RouteFeature[] })
        .filter((data) =>
          data.features.some(
            (f) => f.geometry?.type === 'LineString' && 'stageColor' in (f.properties ?? {}),
          ),
        )
        .at(-1)!;
      for (const f of routesCall.features) {
        expect(f.properties.stageColor).toBeNull();
      }
      // Sanity: features were non-empty (clearEmphasis restores all routes).
      expect(features.length).toBeGreaterThan(0);
    });

    it('uses a line-color expression that prefers stageColor over category', () => {
      service.init(map);
      service.renderRoutes(mockRoutes, routeSelected);
      const routesLayer = addLayer.mock.calls.find(
        ([layer]) => layer.id === ROUTES_LAYER_ID,
      )![0];
      const expr = routesLayer.paint['line-color'] as unknown[];
      // Expression shape: coalesce(get('stageColor'), <category match expr>).
      expect(expr[0]).toBe('coalesce');
      expect(expr[1]).toEqual(['get', 'stageColor']);
      // The category fallback is preserved as the second coalesce argument.
      const fallback = expr[2] as unknown[];
      expect(fallback[0]).toBe('match');
    });
  });
});

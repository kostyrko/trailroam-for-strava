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

describe('RouteRendererService', () => {
  let addLayer: ReturnType<typeof vi.fn>;
  let addSource: ReturnType<typeof vi.fn>;
  let getCanvas: ReturnType<typeof vi.fn>;
  let getSource: ReturnType<typeof vi.fn>;
  let map: Map;
  let on: ReturnType<typeof vi.fn>;
  let routeSelected: ReturnType<typeof vi.fn<RouteSelectedHandler>>;
  let setFilter: ReturnType<typeof vi.fn>;
  let service: RouteRendererService;

  const mockRoutes = [makeMockRoute({ activityId: 'test:1', name: 'Route 1' }), makeMockRoute({ activityId: 'test:2', name: 'Route 2' })];

  beforeEach(() => {
    addLayer = vi.fn();
    addSource = vi.fn();
    getCanvas = vi.fn().mockReturnValue({ style: { cursor: '' } });
    getSource = vi.fn().mockReturnValue(null);
    on = vi.fn();
    routeSelected = vi.fn<RouteSelectedHandler>();
    setFilter = vi.fn();
    map = {
      addLayer,
      addSource,
      getCanvas,
      getSource,
      on,
      setFilter,
      isStyleLoaded: () => true,
    } as unknown as Map;
    service = new RouteRendererService();
  });

  it('should render each route as a separate GeoJSON feature', () => {
    service.init(map);
    service.renderRoutes(mockRoutes, routeSelected);

    expect(addSource).toHaveBeenCalledWith(
      ROUTES_SOURCE_ID,
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'FeatureCollection',
          features: expect.arrayContaining(
            mockRoutes.map((route) =>
              expect.objectContaining({
                properties: expect.objectContaining({
                  activityId: route.activityId,
                  name: route.name,
                }),
                geometry: expect.objectContaining({
                  type: 'LineString',
                  coordinates: route.coordinates,
                }),
              }),
            ),
          ),
        }),
        type: 'geojson',
      }),
    );
    const sourceDefinition = addSource.mock.calls[0][1];
    expect(sourceDefinition.data.features).toHaveLength(mockRoutes.length);
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
});

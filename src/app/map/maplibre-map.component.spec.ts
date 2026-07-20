import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { type Map } from 'maplibre-gl';
import { OPENFREEMAP_BASEMAP_PROVIDER, type ResolvedBasemapProvider } from './basemap-provider';
import { BasemapProviderService } from './basemap-provider.service';
import { MapLibreMapComponent } from './maplibre-map.component';
import { MapLibreService } from './maplibre.service';
import { type MapRouteFeature } from './mock-routes';
import { RouteRendererService } from './route-renderer.service';
import type { SavedPlaceRecord } from '../storage/storage.models';

function makePopupMock() {
  return {
    isOpen: vi.fn().mockReturnValue(false),
    openOn: vi.fn(),
    remove: vi.fn(),
    setDOMContent: vi.fn().mockReturnThis(),
    getElement: vi.fn().mockReturnValue(document.createElement('div')),
  };
}

function makeMarkerMock() {
  const popup = makePopupMock();
  const el = document.createElement('div');
  return {
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    on: vi.fn(),
    off: vi.fn(),
    getElement: vi.fn().mockReturnValue(el),
    getPopup: vi.fn().mockReturnValue(popup),
    setDraggable: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    togglePopup: vi.fn(),
  };
}

vi.mock('maplibre-gl', () => {
  const NavigationControl = vi.fn();
  const ScaleControl = vi.fn();
  const Marker = vi.fn(function () {
    return makeMarkerMock();
  });
  const Popup = vi.fn(function () {
    return makePopupMock();
  });
  return {
    default: { NavigationControl, ScaleControl, Marker, Popup },
    NavigationControl,
    ScaleControl,
    Marker,
    Popup,
  };
});

function makeSavedPlace(overrides: Partial<SavedPlaceRecord> = {}): SavedPlaceRecord {
  return {
    id: 'place:1',
    name: 'Test Place',
    latitude: 50.0614,
    longitude: 19.9372,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

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
      simplifiedCoordinates: [
        [19.9, 50.05],
        [19.91, 50.06],
      ],
      simplifiedPointCount: 2,
      pointCount: 2,
      bounds: { west: 19.9, south: 50.05, east: 19.91, north: 50.06 },
      syncedAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    coordinates: [
      [19.9, 50.05],
      [19.91, 50.06],
    ],
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
    mockRenderer = {
      renderRoutes,
      selectRoute,
      fitToRoute,
      init: vi.fn(),
      updateRoutes: vi.fn(),
      deselectRoute: vi.fn(),
      clearHoverPoint: vi.fn(),
      showHoverPoint: vi.fn(),
      clearEmphasis: vi.fn(),
      setEmphasis: vi.fn(),
    };
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

    fixture.componentInstance.flyToBounds(
      [
        [19.9, 50.05],
        [19.91, 50.06],
      ],
      { west: 19.9, south: 50.05, east: 19.91, north: 50.06 },
    );

    expect(fitToRoute).toHaveBeenCalledWith(
      [
        [19.9, 50.05],
        [19.91, 50.06],
      ],
      { west: 19.9, south: 50.05, east: 19.91, north: 50.06 },
    );
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

    expect(mapFitBounds).toHaveBeenCalledWith([19.79, 49.96, 20.21, 50.12], {
      padding: 80,
      maxZoom: 15,
    });
    expect(mapFlyTo).not.toHaveBeenCalled();
  });

  it('should queue flyTo into pendingReadyTasks when the map is not ready', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.componentInstance.flyTo([19.945, 50.0647]);
    expect(mapFlyTo).not.toHaveBeenCalled();

    fixture.detectChanges();
    await fixture.whenStable();
    expect(mapFlyTo).toHaveBeenCalledWith({ center: [19.945, 50.0647], zoom: 13 });
  });

  it('onSearchSelected routes a search result into fitBounds when bbox is present', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const native: HTMLElement = fixture.nativeElement;
    (native.querySelector('.map-search-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const panelDebug = fixture.debugElement.query(By.css('app-map-search-panel'));
    const panel = panelDebug.componentInstance as {
      searchSelected: { emit: (v: unknown) => void };
    };
    panel.searchSelected.emit({
      result: { label: 'Kraków', center: [19.945, 50.0647], bbox: [19.79, 49.96, 20.21, 50.12] },
      kind: 'place',
    });

    expect(mapFitBounds).toHaveBeenCalledWith([19.79, 49.96, 20.21, 50.12], {
      padding: 80,
      maxZoom: 15,
    });
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

  describe('saved-place markers', () => {
    it('creates a marker when savedPlaces input has items and showSavedPlaceMarkers is true', async () => {
      fixture = TestBed.createComponent(MapLibreMapComponent);
      fixture.componentRef.setInput('savedPlaces', [makeSavedPlace()]);
      fixture.componentRef.setInput('showSavedPlaceMarkers', true);
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 50));

      const { Marker } = await import('maplibre-gl');
      const MarkerMock = Marker as unknown as ReturnType<typeof vi.fn>;
      expect(MarkerMock).toHaveBeenCalledWith(
        expect.objectContaining({ color: '#1f6f50', draggable: true }),
      );
      const markerInstance = MarkerMock.mock.results.find((r: any) => r.type === 'return')?.value;
      expect(markerInstance).toBeDefined();
      expect(markerInstance.addTo).toHaveBeenCalled();
    });

    it('does not create markers when showSavedPlaceMarkers is false', async () => {
      fixture = TestBed.createComponent(MapLibreMapComponent);
      // The initial effect fires with default inputs (savedPlaces:[], showSavedPlaceMarkers:true),
      // so it schedules a retry but creates no markers (empty list). After setting inputs to
      // non-empty with showSavedPlaceMarkers=false, reconcile should bail out without creating.
      const { Marker } = await import('maplibre-gl');
      const MarkerMock = Marker as unknown as ReturnType<typeof vi.fn>;
      MarkerMock.mockClear();

      fixture.componentRef.setInput('savedPlaces', [makeSavedPlace()]);
      fixture.componentRef.setInput('showSavedPlaceMarkers', false);
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 150)); // let any retry timer fire

      expect(MarkerMock).not.toHaveBeenCalled();
    });

    it('focusSavedPlace flies to the place center and opens popup', async () => {
      fixture = TestBed.createComponent(MapLibreMapComponent);
      fixture.componentRef.setInput('savedPlaces', [makeSavedPlace()]);
      fixture.componentRef.setInput('showSavedPlaceMarkers', true);
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 50));

      fixture.componentInstance.focusSavedPlace(makeSavedPlace());

      expect(mapFlyTo).toHaveBeenCalledWith({ center: [19.9372, 50.0614], zoom: 13 });
    });

    it('emits markerRepositioned on dragend', async () => {
      const place = makeSavedPlace();
      const repositionSpy = vi.fn();
      fixture = TestBed.createComponent(MapLibreMapComponent);
      fixture.componentInstance.markerRepositioned.subscribe(repositionSpy);
      fixture.componentRef.setInput('savedPlaces', [place]);
      fixture.componentRef.setInput('showSavedPlaceMarkers', true);
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 150));

      const MarkerMock = (await import('maplibre-gl')).Marker as unknown as ReturnType<
        typeof vi.fn
      >;
      // Find the most recently created marker instance
      const results = MarkerMock.mock.results.filter((r: any) => r.type === 'return');
      expect(results.length).toBeGreaterThanOrEqual(1);
      const markerInstance = results[results.length - 1].value;

      const dragendCall = markerInstance.on.mock.calls.find((c: any) => c[0] === 'dragend');
      expect(dragendCall).toBeDefined();

      markerInstance.getLngLat = vi.fn().mockReturnValue({ lat: 50.1, lng: 20.0 });
      // The dragend handler calls this.ngZone.run(...) which in tests runs synchronously.
      dragendCall[1]();
      expect(repositionSpy).toHaveBeenCalledWith({
        id: place.id,
        latitude: 50.1,
        longitude: 20.0,
      });
    });
  });
});

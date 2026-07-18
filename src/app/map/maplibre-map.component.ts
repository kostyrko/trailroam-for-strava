import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { type Map as MapLibreMap, type Marker, type Popup } from 'maplibre-gl';
import { AVAILABLE_PROVIDERS, BasemapProviderService } from './basemap-provider.service';
import { logger } from '../shared/logger';
import { type BasemapProviderConfig } from './basemap-provider';
import { type MapRouteFeature } from './mock-routes';
import type { RouteBounds, SavedPlaceRecord } from '../storage/storage.models';
import { MapLibreService } from './maplibre.service';
import { RouteRendererService } from './route-renderer.service';
import { IconComponent } from '../shared/icon.component';
import { MapSearchPanelComponent, type SearchSelectedPayload } from './map-search-panel.component';
import type { GeocodeResult } from './geocoding.service';

/** Pin color for saved-place markers — distinct from activity route colors. */
const SAVED_PLACE_MARKER_COLOR = '#1f6f50';

@Component({
  imports: [IconComponent, MapSearchPanelComponent],
  selector: 'app-maplibre-map',
  templateUrl: './maplibre-map.component.html',
})
export class MapLibreMapComponent implements AfterViewInit, OnDestroy {
  @Input()
  set fullscreenOverride(value: boolean) {
    if (this.fullscreen() !== value) {
      this.fullscreen.set(value);
      this.fullscreenChanged.emit(value);
      this.scheduleResize();
    }
  }

  @Output()
  readonly basemapLoadFailed = new EventEmitter<void>();

  @Output()
  readonly routeSelected = new EventEmitter<MapRouteFeature>();

  @Output()
  readonly fullscreenChanged = new EventEmitter<boolean>();

  @Output()
  readonly routesRendered = new EventEmitter<void>();

  @Output()
  readonly mapIdle = new EventEmitter<void>();

  @Output()
  readonly viewportChanged = new EventEmitter<[[number, number], [number, number]]>();

  /** Saved places to render as persistent markers. Driven by MapPage from SavedPlacesService. */
  readonly savedPlaces = input<SavedPlaceRecord[]>([]);

  /** Emits when the user clicks "Remove place" inside a saved-marker popup. */
  @Output()
  readonly removePlaceRequested = new EventEmitter<SavedPlaceRecord>();

  /** Emits the search result the user just selected (re-emitted from the search panel). */
  @Output()
  readonly placeSelected = new EventEmitter<SearchSelectedPayload>();

  /** Emits when the user clicks "Save place" for the selected search result. */
  @Output()
  readonly savePlaceRequested = new EventEmitter<GeocodeResult>();

  /** Drives the search panel's "Saved" badge: true when the selected result is already saved. */
  readonly selectedResultSaved = signal(false);

  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer!: ElementRef<HTMLElement>;

  @ViewChild('layerBtn', { static: true })
  private readonly layerBtn!: ElementRef<HTMLElement>;

  @ViewChild('opacitySlider', { static: true })
  private readonly opacitySlider!: ElementRef<HTMLInputElement>;

  private readonly mapLibreService = inject(MapLibreService);
  private readonly basemapProviderService = inject(BasemapProviderService);
  private readonly routeRendererService = inject(RouteRendererService);
  private isHeatmapMode = false;
  private readonly ngZone = inject(NgZone);
  private isDestroyed = false;
  private pendingReadyTasks: (() => void)[] = [];
  protected readonly fullscreen = signal(false);
  private mapInstance: MapLibreMap | null = null;
  /** Active saved-place markers, keyed by SavedPlaceRecord.id. Reconciled from the input. */
  private savedPlaceMarkers = new Map<string, Marker>();

  constructor() {
    // Reconcile saved-place markers whenever the input changes. The map may not be ready yet on
    // the first run; in that case the reconciliation is queued and re-run once the style loads.
    // `reconcileSavedPlaceMarkers` always reads the *current* input value at execution time, so a
    // stale closure array (e.g. an empty list captured before `load()` resolved) is never used.
    effect(() => {
      this.savedPlaces();
      void this.reconcileSavedPlaceMarkers();
    });
  }

  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;
  protected readonly activeProviderId = signal(this.basemapProviderService.getSelectedProvider().config.id);
  protected readonly layerMenuOpen = signal(false);
  protected readonly heatmapActive = signal(false);
  private readonly heatmapOpacity = signal(100);
  protected readonly opacitySliderValue = signal(100);
  protected readonly sliderVisible = signal(false);
  protected readonly searchPanelVisible = signal(false);

  protected toggleLayerMenu(): void {
    this.layerMenuOpen.update((v) => !v);
    if (this.layerMenuOpen()) {
      setTimeout(() => document.addEventListener('click', this.closeLayerMenu));
    } else {
      document.removeEventListener('click', this.closeLayerMenu);
    }
  }

  private readonly closeLayerMenu = (): void => {
    this.layerMenuOpen.set(false);
    document.removeEventListener('click', this.closeLayerMenu);
  };

  protected selectLayer(config: BasemapProviderConfig): void {
    this.activeProviderId.set(config.id);
    this.layerMenuOpen.set(false);
    document.removeEventListener('click', this.closeLayerMenu);
    this.basemapProviderService.setProvider(config);
    const map = this.mapInstance;
    if (!map) { return; }
    this.pendingReadyTasks = [];
    map.once('style.load', () => {
      this.routeRendererService.init(map);
      this.drainPendingTasks('selectLayer');
      this.rerenderRoutes();
      // Markers are DOM overlays and normally survive a style change, but reconcile defensively
      // so saved-place markers are always present after switching basemaps.
      void this.reconcileSavedPlaceMarkers();
    });
    map.setStyle(config.styleUrl!);
  }

  private drainPendingTasks(source: string): void {
    const tasks = this.pendingReadyTasks;
    this.pendingReadyTasks = [];
    logger.trace(`drainPendingTasks from ${source}: ${tasks.length} pending tasks, ${this.cachedRoutes.length} cached routes`);
    for (const t of tasks) { t(); }
  }

  private rerenderRoutes(): void {
    this.routeRendererService.renderRoutes(this.cachedRoutes, (route) => this.routeSelected.emit(route));
  }

  private queueOrRender(routes: MapRouteFeature[], selectedId?: string): void {
    const map = this.mapInstance;
    if (!map) {
      logger.trace(`queueOrRender: map null, queuing ${routes.length} routes`);
      this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectedId));
      return;
    }
    if (map.isStyleLoaded()) {
      logger.trace(`queueOrRender: style loaded, rendering ${routes.length} routes directly`);
      this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
      if (selectedId) {
        this.routeRendererService.selectRoute(selectedId);
        const selected = routes.find((r) => r.activityId === selectedId || r.activity.id === selectedId);
        if (selected) {
          this.routeRendererService.fitToRoute(selected.coordinates, selected.route.bounds);
        }
      }
      return;
    }
    logger.trace(`queueOrRender: waiting for style, will poll for ${routes.length} routes`);
    this.pollForStyle(routes, selectedId);
  }

  private pollForStyle(routes: MapRouteFeature[], selectedId?: string, attempt = 0): void {
    if (this.isDestroyed) { return; }
    if (!this.mapInstance) {
      this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectedId));
      return;
    }
    if (this.mapInstance.isStyleLoaded()) {
      this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
      this.routesRendered.emit();
      if (selectedId) {
        this.routeRendererService.selectRoute(selectedId);
        const selected = routes.find((r) => r.activityId === selectedId || r.activity.id === selectedId);
        if (selected) {
          this.routeRendererService.fitToRoute(selected.coordinates, selected.route.bounds);
        }
      }
      return;
    }
    if (attempt >= 50) {
      logger.warn(`pollForStyle: giving up after ${attempt} attempts`);
      return;
    }
    setTimeout(() => this.pollForStyle(routes, selectedId, attempt + 1), 100);
  }

  private cachedRoutes: MapRouteFeature[] = [];

  renderRouteFeatures(routes: MapRouteFeature[], selectedId?: string): void {
    this.cachedRoutes = routes;
    if (routes.length === 0) { return; }
    const map = this.mapInstance;
    if (!map) {
      this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectedId));
      return;
    }
    const sourceExists = map.getSource('trailroam-routes') !== undefined;
    if (sourceExists) {
      this.routeRendererService.updateRoutes(routes);
      this.routesRendered.emit();
      return;
    }
    if (!map.isStyleLoaded()) {
      this.queueOrRender(routes, selectedId);
      return;
    }
    this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
    this.routesRendered.emit();
    if (selectedId) {
      const selected = routes.find((r) => r.activityId === selectedId || r.activity.id === selectedId);
      if (selected) {
        this.routeRendererService.selectRoute(selectedId);
        this.routeRendererService.fitToRoute(selected.coordinates, selected.route.bounds);
      }
    }
  }

  async ngAfterViewInit(): Promise<void> {
    let map: MapLibreMap;

    try {
      const basemapProvider = this.basemapProviderService.getSelectedProvider();
      map = await this.mapLibreService.createMap(this.mapContainer.nativeElement, basemapProvider);
    } catch (err) {
      logger.error('MapLibre initialization failed:', err);
      this.emitBasemapLoadFailed();
      return;
    }

    if (this.isDestroyed) {
      map.remove();
      return;
    }

    this.mapInstance = map;
    this.routeRendererService.init(map);

    map.once('load', () => this.addMapControls());

    map.on('styleimagemissing', (e: { id: string }) => {
      if (map.hasImage(e.id)) { return; }
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      map.addImage(e.id, canvas as unknown as HTMLImageElement | ImageData);
    });

    const emitViewport = () => {
      const b = map.getBounds();
      this.ngZone.run(() => this.viewportChanged.emit([b.getSouthWest().toArray() as [number, number], b.getNorthEast().toArray() as [number, number]]));
    };
    map.on('idle', () => this.ngZone.run(() => this.mapIdle.emit()));
    map.on('moveend', emitViewport);
    map.once('load', emitViewport);

    map.on('error', (err) => {
      if (err?.error?.status === 404 || err?.error?.status === 403 || err?.error?.status === 500) {
        logger.error('MapLibre runtime error:', err);
        this.emitBasemapLoadFailed();
      }
    });

    const render = () => {
      logger.trace('ngAfterViewInit render() called');
      this.drainPendingTasks('ngAfterViewInit');
      const routes = this.cachedRoutes;
      if (routes.length > 0) {
        logger.trace(`ngAfterViewInit render: rendering ${routes.length} cached routes`);
        this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
      } else {
        logger.trace('ngAfterViewInit render: no cached routes');
      }
      // Reconcile saved-place markers explicitly once the map is ready. The signal `effect` may
      // have run before the map existed (or before `SavedPlacesService.load()` resolved), so this
      // guarantees loaded places render at startup, not only after a new place is saved.
      void this.reconcileSavedPlaceMarkers();
    };

    if (map.isStyleLoaded()) {
      render();
    } else {
      map.once('style.load', render);
    }
  }

  flyToBounds(coordinates: [number, number][], bounds?: RouteBounds): void {
    if (coordinates.length === 0) { return; }
    const map = this.mapInstance;
    if (!map || !map.isStyleLoaded()) {
      this.pendingReadyTasks.push(() => this.flyToBounds(coordinates, bounds));
      return;
    }
    this.routeRendererService.fitToRoute(coordinates, bounds);
  }

  /**
   * Navigates the map to a single point. Used by Map Explorer search. When `bounds` are
   * provided (a place with a known extent), fits to the bounds; otherwise flies to the
   * center, ensuring the zoom reaches a useful street level even when zoomed far out.
   */
  flyTo(center: [number, number], bounds?: [number, number, number, number]): void {
    const map = this.mapInstance;
    if (!map) {
      this.pendingReadyTasks.push(() => this.flyTo(center, bounds));
      return;
    }
    const execute = () => {
      if (bounds) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
      } else {
        map.flyTo({ center, zoom: Math.max(map.getZoom(), 13) });
      }
    };
    if (map.isStyleLoaded()) {
      execute();
    } else {
      map.once('style.load', execute);
    }
  }

  /**
   * Pans/zooms the map to a saved place (used when selecting a place from the panel) and opens
   * its marker popup. Idempotent if the marker does not exist yet (it will be created on reconcile).
   */
  focusSavedPlace(place: SavedPlaceRecord): void {
    const center: [number, number] = [place.longitude, place.latitude];
    this.flyTo(center);
    const marker = this.savedPlaceMarkers.get(place.id);
    if (marker) {
      const popup = marker.getPopup();
      if (popup) { marker.togglePopup(); }
    }
  }

  /**
   * Reconciles the rendered saved-place markers against the current `savedPlaces` input: adds
   * markers for new places, removes markers for places no longer present, and updates names/popups
   * for changed places. Reads the input fresh on every call so a queue/style-load callback always
   * uses the latest data, never a stale closure array. Implemented with MapLibre `Marker`s (not
   * sources/layers) so they stay independent of route rendering.
   *
   * If the map or its style is not ready yet, this schedules a short retry rather than relying on
   * a single `style.load` one-shot (which can race and fire before the input is populated).
   */
  private async reconcileSavedPlaceMarkers(): Promise<void> {
    if (this.isDestroyed) { return; }
    const map = this.mapInstance;
    if (!map || !map.isStyleLoaded()) {
      // Poll briefly until the map and its style are ready, then reconcile with the latest input.
      setTimeout(() => this.reconcileSavedPlaceMarkers(), 100);
      return;
    }

    const places = this.savedPlaces();
    const next = new Map(places.map((p) => [p.id, p]));

    // Remove stale markers.
    for (const [id, marker] of this.savedPlaceMarkers) {
      if (!next.has(id)) {
        marker.remove();
        this.savedPlaceMarkers.delete(id);
      }
    }

    // Add or update markers.
    const maplibregl = (await import('maplibre-gl')).default;
    for (const place of places) {
      const existing = this.savedPlaceMarkers.get(place.id);
      if (existing) {
        existing.setLngLat([place.longitude, place.latitude]);
        existing.setPopup(this.buildSavedPlacePopup(place, maplibregl.Popup));
        this.applyMarkerAccessibility(existing, place);
        continue;
      }
      const marker = new maplibregl.Marker({ color: SAVED_PLACE_MARKER_COLOR })
        .setLngLat([place.longitude, place.latitude])
        .setPopup(this.buildSavedPlacePopup(place, maplibregl.Popup))
        .addTo(map);
      this.applyMarkerAccessibility(marker, place);
      this.savedPlaceMarkers.set(place.id, marker);
    }
  }

  /**
   * Marks a saved-place marker's DOM element as an accessible image with a stable label, so each
   * marker is announced as representing a single saved place on the map. MapLibre markers are not
   * labelled by default; without this they read as empty images to assistive tech.
   */
  private applyMarkerAccessibility(marker: Marker, place: SavedPlaceRecord): void {
    const el = marker.getElement();
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `Map marker for saved place ${place.name}`);
  }

  /**
   * Builds the compact popup shown when a saved-place marker is clicked: the saved name,
   * secondary location text, and a "Remove place" button. The Remove button is wired here so the
   * click bubbles up to the container via `removePlaceRequested`.
   */
  private buildSavedPlacePopup(
    place: SavedPlaceRecord,
    PopupCtor: new (opts: { closeButton: boolean; closeOnClick: boolean }) => Popup,
  ): Popup {
    const container = document.createElement('div');
    container.className = 'saved-place-popup';

    const name = document.createElement('strong');
    name.className = 'saved-place-popup__name';
    name.textContent = place.name;
    container.appendChild(name);

    if (place.secondaryLabel) {
      const secondary = document.createElement('span');
      secondary.className = 'saved-place-popup__secondary';
      secondary.textContent = place.secondaryLabel;
      container.appendChild(secondary);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'saved-place-popup__remove';
    removeBtn.textContent = 'Remove place';
    removeBtn.setAttribute('aria-label', `Remove saved place ${place.name}`);
    // Run inside the Angular zone so change detection proceeds after the emit.
    removeBtn.addEventListener('click', () => {
      this.ngZone.run(() => this.removePlaceRequested.emit(place));
    });
    container.appendChild(removeBtn);

    return new PopupCtor({ closeButton: false, closeOnClick: true }).setDOMContent(container);
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.pendingReadyTasks = [];
    for (const marker of this.savedPlaceMarkers.values()) {
      marker.remove();
    }
    this.savedPlaceMarkers.clear();
    this.mapInstance = null;
    document.removeEventListener('click', this.closeLayerMenu);
    document.removeEventListener('click', this.closeSearchPanel);
  }

  protected toggleSliderVisibility(): void {
    this.sliderVisible.update((v) => !v);
  }

  protected toggleSearchPanel(): void {
    const next = !this.searchPanelVisible();
    this.searchPanelVisible.set(next);
    if (next) {
      setTimeout(() => document.addEventListener('click', this.closeSearchPanel));
    } else {
      document.removeEventListener('click', this.closeSearchPanel);
    }
  }

  private readonly closeSearchPanel = (): void => {
    this.searchPanelVisible.set(false);
    document.removeEventListener('click', this.closeSearchPanel);
  };

  protected onSearchSelected(payload: SearchSelectedPayload): void {
    const { result } = payload;
    this.flyTo(result.center, result.bbox);
    // Reset the saved badge for the new selection; the container recomputes it.
    this.selectedResultSaved.set(false);
    this.placeSelected.emit(payload);
  }

  /** Re-emits the save request from the search panel; the container opens the name dialog. */
  protected onSavePlaceRequested(result: GeocodeResult): void {
    this.savePlaceRequested.emit(result);
  }

  protected toggleHeatmap(): void {
    this.routeRendererService.toggleHeatmap();
    this.isHeatmapMode = !this.isHeatmapMode;
    this.heatmapActive.set(this.isHeatmapMode);
    if (this.isHeatmapMode) {
      const el = this.opacitySlider?.nativeElement;
      if (el) {
        el.value = '33';
        this.opacitySliderValue.set(33);
        this.routeRendererService.setLayerOpacity(0.33);
      }
    } else {
      const val = this.heatmapOpacity();
      const el = this.opacitySlider?.nativeElement;
      if (el) {
        el.value = String(val);
        this.opacitySliderValue.set(val);
        this.routeRendererService.setLayerOpacity(val / 100);
      }
    }
  }

  protected onOpacityChange(value: string): void {
    const numeric = parseInt(value, 10) / 100;
    this.routeRendererService.setLayerOpacity(numeric);
    this.heatmapOpacity.set(parseInt(value, 10));
  }

  protected toggleFullscreen(): void {
    const next = !this.fullscreen();
    this.fullscreen.set(next);
    this.fullscreenChanged.emit(next);
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.fullscreen()) {
      this.fullscreen.set(false);
      this.fullscreenChanged.emit(false);
      event.preventDefault();
    }
    if (event.key === 'Escape') {
      this.layerMenuOpen.set(false);
      this.searchPanelVisible.set(false);
      document.removeEventListener('click', this.closeLayerMenu);
    }
  }

  private scheduleResize(): void {
    setTimeout(() => {
      this.mapInstance?.resize();
    }, 0);
  }

  private controlsAdded = false;

  private addMapControls(): void {
    const map = this.mapInstance;
    if (!map || this.controlsAdded) { return; }
    (async () => {
      try {
        const { default: maplibregl } = await import('maplibre-gl');
        map.addControl(new maplibregl.NavigationControl({}), 'top-left');
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 200 }), 'bottom-right');
        this.controlsAdded = true;
      } catch {
      }
    })();
  }

  private emitBasemapLoadFailed(): void {
    this.ngZone.run(() => {
      this.basemapLoadFailed.emit();
    });
  }
}

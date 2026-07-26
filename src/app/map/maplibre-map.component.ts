import {
  AfterViewInit,
  ApplicationRef,
  Component,
  ComponentRef,
  ElementRef,
  EnvironmentInjector,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  createComponent,
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
import { SavedPlaceDetailsCardComponent } from './saved-place-details-card.component';
import { MapContextMenuComponent } from './map-context-menu.component';

/** Pin color for saved-place markers — distinct from activity route colors. */
const SAVED_PLACE_MARKER_COLOR = '#1f6f50';

@Component({
  imports: [IconComponent, MapSearchPanelComponent, MapContextMenuComponent],
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

  /**
   * Whether saved-place markers should be visible. Mirrors the active left-panel tab: true on the
   * Places and All tabs, false on the Activities tab. When false, existing markers are removed and
   * no new ones are created (the saved-places data itself is unaffected).
   */
  readonly showSavedPlaceMarkers = input(true);

  /** Emits when the user clicks "Edit" inside a saved-marker popup. */
  @Output()
  readonly editPlaceRequested = new EventEmitter<SavedPlaceRecord>();

  /** Emits when the user clicks "Remove place" inside a saved-marker popup. */
  @Output()
  readonly removePlaceRequested = new EventEmitter<SavedPlaceRecord>();

  /** Emits when a saved-place marker is dragged to a new position on the map. */
  @Output()
  readonly markerRepositioned = new EventEmitter<{
    id: string;
    latitude: number;
    longitude: number;
  }>();

  /** Emits the search result the user just selected (re-emitted from the search panel). */
  @Output()
  readonly placeSelected = new EventEmitter<SearchSelectedPayload>();

  /** Emits when the user clicks "Save place" for the selected search result. */
  @Output()
  readonly savePlaceRequested = new EventEmitter<GeocodeResult>();

  /** Emits when the user wants to save a place from the right-click context menu. */
  @Output()
  readonly savePlaceFromContextMenu = new EventEmitter<{
    longitude: number;
    latitude: number;
  }>();

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
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private isHeatmapMode = false;
  private readonly ngZone = inject(NgZone);
  private isDestroyed = false;
  private pendingReadyTasks: (() => void)[] = [];
  protected readonly fullscreen = signal(false);
  private mapInstance: MapLibreMap | null = null;
  /** Active saved-place markers, keyed by SavedPlaceRecord.id. Reconciled from the input. */
  private savedPlaceMarkers = new Map<string, Marker>();
  /** Cleanup functions for drag-end event handlers, keyed by SavedPlaceRecord.id. */
  private markerDragHandlers = new Map<string, () => void>();
  /** Dynamically-created card component refs for saved-place popups, keyed by SavedPlaceRecord.id. */
  private savedPlaceCardRefs = new Map<string, ComponentRef<SavedPlaceDetailsCardComponent>>();
  /**
   * Id of the saved place whose popup is "pinned" open (opened from the left panel).
   * A pinned popup stays visible even when the cursor leaves the marker — it is only closed
   * via the close button, selecting another place, or clicking outside the card.
   */
  private readonly pinnedPlaceId = signal<string | null>(null);

  /** Right-click context menu position (viewport pixels). Null = menu closed. */
  protected readonly contextMenuPos = signal<{ x: number; y: number } | null>(null);
  /** Coordinates [lng, lat] captured at the last right-click. */
  private pendingContextCoords: [number, number] | null = null;
  /** Temporary marker shown while the save-place dialog is open. */
  private tempContextMarker: Marker | null = null;

  constructor() {
    // Reconcile saved-place markers whenever the places list or the visibility flag changes. The
    // map may not be ready yet on the first run; in that case reconciliation retries until ready.
    // `reconcileSavedPlaceMarkers` always reads the *current* inputs at execution time, so a
    // stale closure array (e.g. an empty list captured before `load()` resolved) is never used.
    effect(() => {
      this.savedPlaces();
      this.showSavedPlaceMarkers();
      void this.reconcileSavedPlaceMarkers();
    });
  }

  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;
  protected readonly activeProviderId = signal(
    this.basemapProviderService.getSelectedProvider().config.id,
  );
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
    if (!map) {
      return;
    }
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
    logger.trace(
      `drainPendingTasks from ${source}: ${tasks.length} pending tasks, ${this.cachedRoutes.length} cached routes`,
    );
    for (const t of tasks) {
      t();
    }
  }

  private rerenderRoutes(): void {
    this.routeRendererService.renderRoutes(this.cachedRoutes, (route) =>
      this.routeSelected.emit(route),
    );
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
        const selected = routes.find(
          (r) => r.activityId === selectedId || r.activity.id === selectedId,
        );
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
    if (this.isDestroyed) {
      return;
    }
    if (!this.mapInstance) {
      this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectedId));
      return;
    }
    if (this.mapInstance.isStyleLoaded()) {
      this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
      this.routesRendered.emit();
      if (selectedId) {
        this.routeRendererService.selectRoute(selectedId);
        const selected = routes.find(
          (r) => r.activityId === selectedId || r.activity.id === selectedId,
        );
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
    if (routes.length === 0) {
      return;
    }
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
      const selected = routes.find(
        (r) => r.activityId === selectedId || r.activity.id === selectedId,
      );
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
      if (map.hasImage(e.id)) {
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      map.addImage(e.id, canvas as unknown as HTMLImageElement | ImageData);
    });

    const emitViewport = () => {
      const b = map.getBounds();
      this.ngZone.run(() =>
        this.viewportChanged.emit([
          b.getSouthWest().toArray() as [number, number],
          b.getNorthEast().toArray() as [number, number],
        ]),
      );
    };
    map.on('idle', () => this.ngZone.run(() => this.mapIdle.emit()));
    map.on('moveend', emitViewport);
    map.once('load', emitViewport);

    map.on('click', () => {
      // Clicking the map background unpins any pinned (panel-selected) popup.
      const pinned = this.pinnedPlaceId();
      if (pinned) {
        this.pinnedPlaceId.set(null);
        const marker = this.savedPlaceMarkers.get(pinned);
        if (marker) {
          const popup = marker.getPopup();
          if (popup && popup.isOpen()) {
            popup.remove();
          }
        }
      }
    });

    // Close the context menu when the user starts panning or zooming.
    map.on('movestart', () => this.closeContextMenu());

    // Right-click context menu for saving a place.
    this.mapContainer.nativeElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.mapInstance) return;
      const rect = this.mapContainer.nativeElement.getBoundingClientRect();
      const lngLat = this.mapInstance.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      if (!lngLat || !Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;
      this.pendingContextCoords = [lngLat.lng, lngLat.lat];
      this.contextMenuPos.set({ x: e.clientX, y: e.clientY });
    });

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
    if (coordinates.length === 0) {
      return;
    }
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
    if (bounds) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
    } else {
      map.flyTo({ center, zoom: Math.max(map.getZoom(), 13) });
    }
  }

  /**
   * Pans/zooms the map to a saved place (used when selecting a place from the panel) and opens
   * its marker popup. If the marker does not exist yet (markers reconcile asynchronously after the
   * map style loads), retries opening the popup for up to 2 seconds.
   */
  focusSavedPlace(place: SavedPlaceRecord, attempt = 0): void {
    const center: [number, number] = [place.longitude, place.latitude];
    if (!this.mapInstance) {
      if (attempt < 20) {
        setTimeout(() => this.focusSavedPlace(place, attempt + 1), 100);
      }
      return;
    }
    this.flyTo(center);
    this.pinnedPlaceId.set(place.id);
    this.openMarkerPopup(place.id);
  }

  /** Opens the popup for a saved-place marker, polling up to 10×200ms if not yet created. */
  private openMarkerPopup(placeId: string, attempt = 0): void {
    const marker = this.savedPlaceMarkers.get(placeId);
    if (marker) {
      const popup = marker.getPopup();
      if (popup && !popup.isOpen()) {
        marker.togglePopup();
      }
      return;
    }
    if (this.isDestroyed) {
      return;
    }
    if (attempt < 10) {
      setTimeout(() => this.openMarkerPopup(placeId, attempt + 1), 200);
    }
  }

  /** Called when the user selects "Add place" from the right-click context menu. */
  protected onContextMenuAddPlace(): void {
    const coords = this.pendingContextCoords;
    if (!coords) return;
    this.contextMenuPos.set(null);

    // Place a temporary marker at the clicked location.
    this.clearTempMarker();
    void this.placeTempMarker(coords);

    this.savePlaceFromContextMenu.emit({
      longitude: coords[0],
      latitude: coords[1],
    });
  }

  /** Closes the context menu without taking any action. */
  protected closeContextMenu(): void {
    this.contextMenuPos.set(null);
    this.pendingContextCoords = null;
  }

  private async placeTempMarker([lng, lat]: [number, number]): Promise<void> {
    const { default: maplibregl } = await import('maplibre-gl');
    const el = document.createElement('div');
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.background = '#1f6f50';
    el.style.border = '3px solid #fff';
    el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';
    el.setAttribute('aria-label', 'New place location');
    this.tempContextMarker = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(this.mapInstance!);
  }

  /** Removes the temporary context-menu marker, if any. */
  clearTempMarker(): void {
    if (this.tempContextMarker) {
      this.tempContextMarker.remove();
      this.tempContextMarker = null;
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
    if (this.isDestroyed) {
      return;
    }
    const map = this.mapInstance;
    if (!map || !map.isStyleLoaded()) {
      // Poll briefly until the map and its style are ready, then reconcile with the latest input.
      setTimeout(() => this.reconcileSavedPlaceMarkers(), 100);
      return;
    }

    // When markers should be hidden (Activities tab), remove all existing markers and stop.
    if (!this.showSavedPlaceMarkers()) {
      for (const [, marker] of this.savedPlaceMarkers) {
        marker.remove();
      }
      this.savedPlaceMarkers.clear();
      for (const cleanup of this.markerDragHandlers.values()) {
        cleanup();
      }
      this.markerDragHandlers.clear();
      for (const ref of this.savedPlaceCardRefs.values()) {
        ref.destroy();
      }
      this.savedPlaceCardRefs.clear();
      return;
    }

    const places = this.savedPlaces();
    const next = new Map(places.map((p) => [p.id, p]));

    // Remove stale markers.
    for (const [id, marker] of this.savedPlaceMarkers) {
      if (!next.has(id)) {
        marker.remove();
        this.savedPlaceMarkers.delete(id);
        const cleanup = this.markerDragHandlers.get(id);
        if (cleanup) {
          cleanup();
          this.markerDragHandlers.delete(id);
        }
        const cardRef = this.savedPlaceCardRefs.get(id);
        if (cardRef) {
          cardRef.destroy();
          this.savedPlaceCardRefs.delete(id);
        }
      }
    }

    // Add or update markers.
    const maplibregl = (await import('maplibre-gl')).default;
    for (const place of places) {
      const existing = this.savedPlaceMarkers.get(place.id);
      if (existing) {
        // Preserve the popup open state: Marker.setPopup() removes the old popup (closing it if
        // open) and sets a new one — it never re-opens the new popup automatically.
        const oldPopup = existing.getPopup();
        const popupWasOpen = oldPopup?.isOpen() ?? false;

        existing.setLngLat([place.longitude, place.latitude]);
        existing.setDraggable(true);
        existing.setPopup(this.buildSavedPlacePopup(place, maplibregl.Popup));

        if (popupWasOpen) {
          existing.togglePopup();
        }

        this.applyMarkerAccessibility(existing, place);
        continue;
      }
      const marker = new maplibregl.Marker({ color: SAVED_PLACE_MARKER_COLOR, draggable: true })
        .setLngLat([place.longitude, place.latitude])
        .setPopup(this.buildSavedPlacePopup(place, maplibregl.Popup))
        .addTo(map);

      // Drag-end handler: persist the new marker position.
      const onDragEnd = () => {
        const pos = marker.getLngLat();
        this.ngZone.run(() =>
          this.markerRepositioned.emit({
            id: place.id,
            latitude: pos.lat,
            longitude: pos.lng,
          }),
        );
      };
      marker.on('dragend', onDragEnd);
      this.markerDragHandlers.set(place.id, () => marker.off('dragend', onDragEnd));

      // Hover popup: show on mouseenter, hide on mouseleave (with generous delay so the cursor can
      // cross the gap between the marker pin and the popup content). Once the popup appears in the
      // DOM, a mouseenter listener on it cancels the hide timer so the popup stays open while the
      // cursor is over it.
      const markerEl = marker.getElement();
      let hideTimer: ReturnType<typeof setTimeout> | null = null;
      let popupListenersAttached = false;

      const attachPopupHover = () => {
        if (popupListenersAttached) {
          return;
        }
        const popup = marker.getPopup();
        const popupEl = popup?.getElement();
        if (!popupEl) {
          return;
        }
        popupListenersAttached = true;
        popupEl.addEventListener('mouseenter', () => {
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
        });
        popupEl.addEventListener('mouseleave', () => {
          const p = marker.getPopup();
          if (p && p.isOpen()) {
            p.remove();
          }
        });
      };

      const onMouseEnter = () => {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        const popup = marker.getPopup();
        if (popup && !popup.isOpen()) {
          marker.togglePopup();
          // After the popup renders, attach hover listeners so the popup stays open when the
          // cursor reaches it. Two requestAnimationFrame calls ensure the DOM has updated.
          requestAnimationFrame(() => requestAnimationFrame(attachPopupHover));
        }
      };

      const onMouseLeave = () => {
        // When the popup was opened from the left panel (pinned), keep it open regardless of
        // cursor position. Only hover-triggered popups auto-close on mouseleave.
        if (this.pinnedPlaceId() === place.id) {
          return;
        }
        hideTimer = setTimeout(() => {
          const popup = marker.getPopup();
          if (popup && popup.isOpen()) {
            popup.remove();
          }
          popupListenersAttached = false;
        }, 800);
      };

      markerEl.addEventListener('mouseenter', onMouseEnter);
      markerEl.addEventListener('mouseleave', onMouseLeave);

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
   * Builds the popup shown on hover over a saved-place marker by dynamically instantiating the
   * {@link SavedPlaceDetailsCardComponent} inside a wrapper element. The card receives input bindings
   * for the place data and emits edit/remove/close events that bubble up through the component's
   * own outputs. The previous card ref for the same place (if any) is destroyed first.
   */
  private buildSavedPlacePopup(
    place: SavedPlaceRecord,
    PopupCtor: new (opts: { closeButton: boolean; closeOnClick: boolean }) => Popup,
  ): Popup {
    const wrapper = document.createElement('div');
    wrapper.style.minWidth = '300px';

    // Destroy any previous card ref for this place before creating a new one.
    const prevRef = this.savedPlaceCardRefs.get(place.id);
    if (prevRef) {
      prevRef.destroy();
      this.savedPlaceCardRefs.delete(place.id);
    }

    const componentRef = createComponent(SavedPlaceDetailsCardComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: wrapper,
    });

    componentRef.setInput('place', place);
    componentRef.setInput('visible', true);

    componentRef.instance.edit.subscribe((p: SavedPlaceRecord) => {
      this.ngZone.run(() => this.editPlaceRequested.emit(p));
    });
    componentRef.instance.remove.subscribe((p: SavedPlaceRecord) => {
      this.ngZone.run(() => this.removePlaceRequested.emit(p));
    });
    componentRef.instance.close.subscribe(() => {
      this.pinnedPlaceId.set(null);
      const marker = this.savedPlaceMarkers.get(place.id);
      if (marker) {
        const popup = marker.getPopup();
        if (popup) {
          popup.remove();
        }
      }
    });

    this.appRef.attachView(componentRef.hostView);
    this.savedPlaceCardRefs.set(place.id, componentRef);

    // After Angular renders into the wrapper, also set min-width on the card element directly.
    requestAnimationFrame(() => {
      const cardEl = wrapper.querySelector('.saved-place-card') as HTMLElement | null;
      if (cardEl) {
        cardEl.style.minWidth = '300px';
      }
    });

    return new PopupCtor({ closeButton: false, closeOnClick: false }).setDOMContent(wrapper);
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.pendingReadyTasks = [];
    for (const cleanup of this.markerDragHandlers.values()) {
      cleanup();
    }
    this.markerDragHandlers.clear();
    for (const ref of this.savedPlaceCardRefs.values()) {
      ref.destroy();
    }
    this.savedPlaceCardRefs.clear();
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
      this.closeContextMenu();
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
    if (!map || this.controlsAdded) {
      return;
    }
    (async () => {
      try {
        const { default: maplibregl } = await import('maplibre-gl');
        map.addControl(new maplibregl.NavigationControl({}), 'top-left');
        map.addControl(
          new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 200 }),
          'bottom-right',
        );
        this.controlsAdded = true;
      } catch {}
    })();
  }

  private emitBasemapLoadFailed(): void {
    this.ngZone.run(() => {
      this.basemapLoadFailed.emit();
    });
  }
}

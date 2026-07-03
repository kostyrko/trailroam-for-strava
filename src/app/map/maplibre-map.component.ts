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
  inject,
  signal,
} from '@angular/core';
import { type Map } from 'maplibre-gl';
import { AVAILABLE_PROVIDERS, BasemapProviderService } from './basemap-provider.service';
import { type BasemapProviderConfig } from './basemap-provider';
import { type MapRouteFeature } from './mock-routes';
import type { RouteBounds } from '../storage/storage.models';
import { MapLibreService } from './maplibre.service';
import { RouteRendererService } from './route-renderer.service';
import { IconComponent } from '../shared/icon.component';

@Component({
  imports: [IconComponent],
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
  private mapInstance: Map | null = null;

  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;
  protected readonly activeProviderId = signal(this.basemapProviderService.getSelectedProvider().config.id);
  protected readonly layerMenuOpen = signal(false);
  protected readonly heatmapActive = signal(false);
  private readonly heatmapOpacity = signal(100);
  protected readonly opacitySliderValue = signal(100);
  protected readonly sliderVisible = signal(false);

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
    });
    map.setStyle(config.styleUrl!);
  }

  private drainPendingTasks(source: string): void {
    const tasks = this.pendingReadyTasks;
    this.pendingReadyTasks = [];
    console.log(`[TRACE] drainPendingTasks from ${source}: ${tasks.length} pending tasks, ${this.cachedRoutes.length} cached routes`);
    for (const t of tasks) { t(); }
  }

  private rerenderRoutes(): void {
    this.routeRendererService.renderRoutes(this.cachedRoutes, (route) => this.routeSelected.emit(route));
  }

  private queueOrRender(routes: MapRouteFeature[], selectedId?: string): void {
    const map = this.mapInstance;
    if (!map) {
      console.log(`[TRACE] queueOrRender: map null, queuing ${routes.length} routes`);
      this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectedId));
      return;
    }
    if (map.isStyleLoaded()) {
      console.log(`[TRACE] queueOrRender: style loaded, rendering ${routes.length} routes directly`);
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
    console.log(`[TRACE] queueOrRender: waiting for style, will poll for ${routes.length} routes`);
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
      console.warn(`[TRACE] pollForStyle: giving up after ${attempt} attempts`);
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
    let map: Map;

    try {
      const basemapProvider = this.basemapProviderService.getSelectedProvider();
      map = await this.mapLibreService.createMap(this.mapContainer.nativeElement, basemapProvider);
    } catch (err) {
      console.error('MapLibre initialization failed:', err);
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
        console.error('MapLibre runtime error:', err);
        this.emitBasemapLoadFailed();
      }
    });

    const render = () => {
      console.log('[TRACE] ngAfterViewInit render() called');
      this.drainPendingTasks('ngAfterViewInit');
      const routes = this.cachedRoutes;
      if (routes.length > 0) {
        console.log(`[TRACE] ngAfterViewInit render: rendering ${routes.length} cached routes`);
        this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
      } else {
        console.log('[TRACE] ngAfterViewInit render: no cached routes');
      }
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


  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.pendingReadyTasks = [];
    this.mapInstance = null;
    document.removeEventListener('click', this.closeLayerMenu);
  }

  protected toggleSliderVisibility(): void {
    this.sliderVisible.update((v) => !v);
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

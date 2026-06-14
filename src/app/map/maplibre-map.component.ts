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
import { MapLibreService } from './maplibre.service';
import { RouteRendererService } from './route-renderer.service';
import { IconComponent } from '../shared/icon.component';

@Component({
  imports: [IconComponent],
  selector: 'app-maplibre-map',
  template: `
    <div class="map-shell" [class.map-fullscreen]="fullscreen()" [class.map-heatmap-active]="heatmapActive()" aria-label="Activity route map" (document:keydown)="onDocumentKeydown($event)">
      <div #mapContainer class="map-container"></div>
      <button
        class="map-fit-btn"
        type="button"
        [attr.aria-label]="fullscreen() ? 'Reset map view' : 'Fit map to screen'"
        (click)="toggleFullscreen()"
        data-tooltip="Fit map"
      >
        @if (fullscreen()) {
          <span class="fit-icon fit-icon-compress">⤡</span>
        } @else {
          <span class="fit-icon fit-icon-expand">⤢</span>
        }
      </button>
      @if (heatmapActive()) {
        <div class="heatmap-legend" aria-label="Heatmap route density legend">
          <span class="heatmap-legend-label">Low</span>
          <div class="heatmap-legend-gradient">
            <span class="heatmap-legend-stop" style="background:rgba(255,59,48,0.08)"></span>
            <span class="heatmap-legend-stop" style="background:rgba(255,59,48,0.2)"></span>
            <span class="heatmap-legend-stop" style="background:rgba(255,59,48,0.4)"></span>
            <span class="heatmap-legend-stop" style="background:rgba(255,59,48,0.6)"></span>
            <span class="heatmap-legend-stop" style="background:rgba(255,59,48,0.85)"></span>
          </div>
          <span class="heatmap-legend-label">High</span>
        </div>
      }
      <div class="map-layer-wrapper">
      <div class="map-layer-btn-group">
        <button #layerBtn class="map-layer-btn" type="button" (click)="toggleLayerMenu()" aria-label="Switch map layer" data-tooltip="Basemap">
          <app-icon name="layers" [size]="18" strokeWidth="2"></app-icon>
        </button>
        @if (layerMenuOpen()) {
          <div class="map-layer-menu" (click)="$event.stopPropagation()">
            @for (provider of AVAILABLE_PROVIDERS; track provider.id) {
              <button class="map-layer-menu-item" type="button" [class.active]="provider.id === activeProviderId()" (click)="selectLayer(provider)">
                @if (provider.id === 'opentopomap') {
                  <app-icon name="mountain" [size]="20" strokeWidth="2" [class]="'map-layer-icon'"></app-icon>
                } @else {
                  <app-icon name="map-pin" [size]="20" strokeWidth="2" [class]="'map-layer-icon'"></app-icon>
                }
                <span class="map-layer-name">{{ provider.label }}</span>
                @if (provider.id === activeProviderId()) {
                  <span class="map-layer-check">✓</span>
                }
              </button>
            }
          </div>
        }
        <button class="map-heatmap-btn" type="button" [class.active]="heatmapActive()" (click)="toggleHeatmap()" [attr.aria-label]="heatmapActive() ? 'Show routes' : 'Show heatmap'" data-tooltip="Heatmap">
          @if (heatmapActive()) {
            <app-icon name="line-squiggle" [size]="18" strokeWidth="2"></app-icon>
          } @else {
            <app-icon name="flame" [size]="18" strokeWidth="2"></app-icon>
          }
        </button>
        <div class="map-opacity-slider-wrapper" data-tooltip="Opacity">
          <label class="map-opacity-slider-label">
            <app-icon name="eye" [size]="14" strokeWidth="3"></app-icon>
          </label>
          <input #opacitySlider class="map-opacity-slider" type="range" min="0" max="100" [value]="opacitySliderValue" (input)="onOpacityChange($any($event.target).value)" aria-label="Adjust layer opacity" />
        </div>
      </div>
      </div>
    </div>
  `,
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
  private pendingReadyTasks: (() => void)[] | null = [];
  protected readonly fullscreen = signal(false);
  private mapInstance: Map | null = null;

  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;
  protected readonly activeProviderId = signal(AVAILABLE_PROVIDERS[0].id);
  protected readonly layerMenuOpen = signal(false);
  protected readonly heatmapActive = signal(false);
  private readonly heatmapOpacity = signal(100);
  protected readonly opacitySliderValue = signal(100);

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
    map.setStyle(config.styleUrl!);
    map.once('style.load', () => {
      this.routeRendererService.init(map);
      const tasks = this.pendingReadyTasks;
      this.pendingReadyTasks = null;
      if (tasks) {
        for (const t of tasks) { t(); }
      }
      this.rerenderRoutes();
    });
  }

  private rerenderRoutes(): void {
    this.routeRendererService.renderRoutes(this.cachedRoutes, (route) => this.routeSelected.emit(route));
  }

  private queueOrRender(routes: MapRouteFeature[], selectedId?: string): void {
    const map = this.mapInstance;
    if (!map) {
      if (this.pendingReadyTasks) {
        this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectedId));
      }
      return;
    }
    if (map.isStyleLoaded()) {
      this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
      return;
    }
    map.once('style.load', () => {
      if (this.isDestroyed) { return; }
      this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
    });
  }

  private cachedRoutes: MapRouteFeature[] = [];

  renderRouteFeatures(routes: MapRouteFeature[], selectedId?: string): void {
    this.cachedRoutes = routes;
    if (routes.length === 0) { return; }
    const map = this.mapInstance;
    if (!map) {
      if (!this.pendingReadyTasks) { this.pendingReadyTasks = []; }
      this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectedId));
      return;
    }
    if (!map.isStyleLoaded()) {
      this.queueOrRender(routes, selectedId);
      return;
    }
    this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
    if (selectedId) {
      const selected = routes.find((r) => r.activityId === selectedId || r.activity.id === selectedId);
      if (selected) {
        this.routeRendererService.selectRoute(selectedId);
        this.routeRendererService.fitToRoute(selected.coordinates);
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

    map.on('error', (err) => {
      if (err?.error?.status === 404 || err?.error?.status === 403 || err?.error?.status === 500) {
        console.error('MapLibre runtime error:', err);
        this.emitBasemapLoadFailed();
      }
    });

    const render = () => {
      const tasks = this.pendingReadyTasks;
      this.pendingReadyTasks = null;
      if (tasks) {
        for (const t of tasks) { t(); }
      }
      const routes = this.cachedRoutes;
      if (routes.length > 0) {
        this.routeRendererService.renderRoutes(routes, (route) => this.routeSelected.emit(route));
      }
    };

    if (map.isStyleLoaded()) {
      render();
    } else {
      map.once('style.load', render);
    }
  }

  flyToBounds(coordinates: [number, number][]): void {
    if (coordinates.length === 0) { return; }
    if (this.pendingReadyTasks) {
      this.pendingReadyTasks.push(() => this.flyToBounds(coordinates));
      return;
    }
    this.routeRendererService.fitToRoute(coordinates);
  }


  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.pendingReadyTasks = null;
    this.mapInstance = null;
    document.removeEventListener('click', this.closeLayerMenu);
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
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 200 }), 'bottom-left');
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

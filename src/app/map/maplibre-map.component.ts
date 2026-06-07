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
import { BasemapProviderService } from './basemap-provider.service';
import { type MapRouteFeature } from './mock-routes';
import { MapLibreService } from './maplibre.service';
import { RouteRendererService } from './route-renderer.service';

@Component({
  selector: 'app-maplibre-map',
  template: `
    <div class="map-shell" [class.map-fullscreen]="fullscreen()" aria-label="Activity route map" (document:keydown)="onDocumentKeydown($event)">
      <div #mapContainer class="map-container"></div>
      <button
        class="map-fit-btn"
        type="button"
        [attr.aria-label]="fullscreen() ? 'Reset map view' : 'Fit map to screen'"
        (click)="toggleFullscreen()"
      >
        @if (fullscreen()) {
          <span class="fit-icon fit-icon-compress">⤡</span>
        } @else {
          <span class="fit-icon fit-icon-expand">⤢</span>
        }
      </button>
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

  private readonly mapLibreService = inject(MapLibreService);
  private readonly basemapProviderService = inject(BasemapProviderService);
  private readonly routeRendererService = inject(RouteRendererService);
  private readonly ngZone = inject(NgZone);
  private isDestroyed = false;
  private pendingReadyTasks: (() => void)[] | null = [];
  protected readonly fullscreen = signal(false);
  private mapInstance: Map | null = null;

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

    map.on('load', () => this.addMapControls());

    map.once('error', (err) => {
      console.error('MapLibre runtime error:', err);
      this.emitBasemapLoadFailed();
    });

    this.routeRendererService.init(map);

    const drain = () => {
      const tasks = this.pendingReadyTasks;
      this.pendingReadyTasks = null;
      if (tasks) {
        for (const t of tasks) {
          t();
        }
      }
    };

    if (map.isStyleLoaded()) {
      drain();
    } else {
      map.once('style.load', drain);
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

  renderRouteFeatures(routes: MapRouteFeature[], selectActivityId?: string): void {
    if (this.pendingReadyTasks) {
      this.pendingReadyTasks.push(() => this.renderRouteFeatures(routes, selectActivityId));
      return;
    }

    this.routeRendererService.renderRoutes(routes, (route) => {
      this.ngZone.run(() => {
        this.routeSelected.emit(route);
      });
    });

    if (selectActivityId) {
      this.routeRendererService.selectRoute(selectActivityId);
      const selected = routes.find((r) => r.activityId === selectActivityId);
      if (selected) {
        this.routeRendererService.fitToRoute(selected.coordinates);
      }
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.pendingReadyTasks = null;
    this.mapInstance = null;
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
  }

  private scheduleResize(): void {
    setTimeout(() => {
      this.mapInstance?.resize();
    }, 0);
  }

  private addMapControls(): void {
    const map = this.mapInstance;
    if (!map) { return; }
    (async () => {
      try {
        const { default: maplibregl } = await import('maplibre-gl');
        map.addControl(new maplibregl.NavigationControl({}), 'top-left');
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 200 }), 'bottom-left');
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

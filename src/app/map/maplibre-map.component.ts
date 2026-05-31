import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { type Map } from 'maplibre-gl';
import { BasemapProviderService } from './basemap-provider.service';
import { type MapRouteFeature } from './mock-routes';
import { MapLibreService } from './maplibre.service';
import { RouteRendererService } from './route-renderer.service';

@Component({
  selector: 'app-maplibre-map',
  template: `
    <div class="map-shell" aria-label="Activity route map">
      <div #mapContainer class="map-container"></div>
    </div>
  `,
})
export class MapLibreMapComponent implements AfterViewInit, OnDestroy {
  @Output()
  readonly basemapLoadFailed = new EventEmitter<void>();

  @Output()
  readonly routeSelected = new EventEmitter<MapRouteFeature>();

  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer!: ElementRef<HTMLElement>;

  private readonly mapLibreService = inject(MapLibreService);
  private readonly basemapProviderService = inject(BasemapProviderService);
  private readonly routeRendererService = inject(RouteRendererService);
  private readonly ngZone = inject(NgZone);
  private isDestroyed = false;
  private pendingReadyTasks: (() => void)[] | null = [];

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
  }

  private emitBasemapLoadFailed(): void {
    this.ngZone.run(() => {
      this.basemapLoadFailed.emit();
    });
  }
}

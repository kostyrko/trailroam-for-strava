import {
  Component,
  input,
  output,
  signal,
  effect,
  ElementRef,
  viewChild,
  inject,
  afterNextRender,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import type { Map as MapLibreMap, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl';
import { ElevationProfileComponent } from '../map/elevation-profile.component';
import { BasemapProviderService, AVAILABLE_PROVIDERS } from '../map/basemap-provider.service';
import { MapLibreService } from '../map/maplibre.service';
import type { BasemapProviderConfig } from '../map/basemap-provider';
import { GpxExportService } from '../shared/gpx-export.service';
import { ToastService } from '../shared/toast.service';
import { ConfirmService } from '../shared/confirm.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { MatDialog } from '@angular/material/dialog';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { type ActivityRecord, type ActivityRouteRecord } from '../storage/storage.models';
import { IconComponent } from '../shared/icon.component';
import { EditActivityDialog } from '../shared/edit-activity-dialog.component';
import {
  formatDistance,
  formatDuration,
  formatSpeedKmh,
  formatElevation,
  formatDateWithTime,
  formatTemperature,
} from '../shared/formatters';
import { SPEED_COLORS, buildSpeedSegments } from '../shared/speed-segments';

@Component({
  selector: 'app-activity-detail-panel',
  imports: [ElevationProfileComponent, IconComponent],
  templateUrl: './activity-detail-panel.component.html',
  styleUrl: './activity-detail-panel.component.scss',
})
export class ActivityDetailPanelComponent {
  private readonly router = inject(Router);
  private readonly basemapProviderService = inject(BasemapProviderService);
  private readonly mapLibreService = inject(MapLibreService);
  private readonly gpxExportService = inject(GpxExportService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly dialog = inject(MatDialog);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly dataRefresh = inject(DataRefreshService);

  readonly activity = input<ActivityRecord | null>(null);
  readonly route = input<
    | (ActivityRouteRecord & {
        coordinates: [number, number][];
        elevations?: number[];
        cumulativeDistances?: number[];
      })
    | null
  >(null);
  readonly pushMode = input(false);
  readonly showInActivities = input(false);
  /** When set, replaces the close button with a "← Back to {label}" link. */
  readonly backLabel = input<string | null>(null);
  /** When provided, controls or initialises the panel-expanded state from the parent. */
  readonly expanded = input<boolean | null>(null);
  readonly close = output<void>();
  readonly panelExpand = output<boolean>();
  /** Emitted when the user clicks "Back to Trail". */
  readonly backToTrail = output<void>();

  protected readonly routeLoading = signal(false);
  protected readonly speedLegend = signal(false);
  protected readonly panelVisible = signal(false);
  protected readonly panelExpanded = signal(false);
  protected readonly layerMenuOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly activeLayerId = signal('openfreemap');
  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;

  protected readonly routeCoords = computed<[number, number][] | undefined>(
    () => this.route()?.coordinates ?? undefined,
  );
  protected readonly routeElevations = computed<number[] | undefined>(
    () => this.route()?.elevations,
  );
  protected readonly routeDistances = computed<number[] | undefined>(
    () => this.route()?.cumulativeDistances,
  );

  protected readonly speedMs = computed(() => {
    const a = this.activity();
    if (!a) {
      return undefined;
    }
    if (a.averageSpeedMetersPerSecond) {
      return a.averageSpeedMetersPerSecond;
    }
    if (a.distanceMeters && a.movingTimeSeconds) {
      return a.distanceMeters / a.movingTimeSeconds;
    }
    return undefined;
  });

  protected readonly maxElevation = computed(() => {
    const el = this.routeElevations();
    if (!el || el.length === 0) {
      return this.activity()?.totalElevationGainMeters;
    }
    return Math.max(...el);
  });

  protected readonly startElevation = computed(() => {
    const el = this.routeElevations();
    if (!el || el.length === 0) {
      return undefined;
    }
    return el[0];
  });

  protected readonly maxSpeedMs = computed(() => this.activity()?.maxSpeedMetersPerSecond);
  protected readonly temperature = computed(() => formatTemperature(this.activity()?.averageTemperatureCelsius));

  // Heart-rate values exposed individually for the grouped (Avg / Min / Max) detail-row layout.
  protected readonly hrAvg = computed(() => roundBpm(this.activity()?.averageHeartrateBpm));
  protected readonly hrMin = computed(() => roundBpm(this.activity()?.minHeartrateBpm));
  protected readonly hrMax = computed(() => roundBpm(this.activity()?.maxHeartrateBpm));
  protected readonly hasHr = computed(() => {
    const a = this.activity();
    return a?.averageHeartrateBpm !== undefined || a?.maxHeartrateBpm !== undefined || a?.minHeartrateBpm !== undefined;
  });

  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  private mapInstance: MapLibreMap | null = null;
  private readonly mapInitialized = signal(false);
  private mapRerenderPending = false;
  private rerenderLoadHandler: (() => void) | null = null;

  constructor() {
    afterNextRender(() => {
      if (!this.pushMode()) {
        setTimeout(() => this.panelVisible.set(true), 10);
      } else {
        this.panelVisible.set(true);
      }
      this.initMap();
    });
    globalThis.addEventListener('click', () => {
      this.layerMenuOpen.set(false);
      this.menuOpen.set(false);
    });

    effect(() => {
      const a = this.activity();
      const r = this.route();
      if (a && r) {
        this.routeLoading.set(true);
        this.speedLegend.set(false);
      }
    });

    effect(() => {
      const a = this.activity();
      const r = this.route();
      const mi = this.mapInitialized();
      if (mi && this.mapInstance && a && r) {
        this.renderRouteOnMap();
        if (!this.mapInstance.isStyleLoaded()) {
          this.mapInstance.once('load', () => this.renderRouteOnMap());
        }
      }
    });

    /* Sync parent-controlled expanded state to the internal signal. */
    effect(() => {
      const val = this.expanded();
      if (val !== null) {
        this.panelExpanded.set(val);
      }
    });
  }

  protected readonly formatDate = formatDateWithTime;
  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatSpeedKmh = formatSpeedKmh;
  protected readonly formatElevation = formatElevation;
  protected readonly formatTemperature = formatTemperature;

  private initMap(): void {
    if (this.mapInitialized()) {
      return;
    }
    this.mapInitialized.set(true);
    this.routeLoading.set(true);
    const container = this.mapContainer()?.nativeElement;
    if (!container) {
      return;
    }
    const provider = this.basemapProviderService.getDefaultProvider();
    this.mapLibreService.createMap(container, provider).then((map) => {
      this.mapInstance = map;
      map.jumpTo({ center: [0, 20], zoom: 2 });
      import('maplibre-gl').then((ml) => {
        const NavControl = (ml as any).NavigationControl ?? (ml as any).default?.NavigationControl;
        const ScaleControl = (ml as any).ScaleControl ?? (ml as any).default?.ScaleControl;
        if (NavControl) {
          map.addControl(new NavControl({ showCompass: false }), 'top-left');
        }
        if (ScaleControl) {
          map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
        }
      });
      map.on('load', () => this.renderRouteOnMap());
    });
  }

  private doneLoading(): void {
    setTimeout(() => this.routeLoading.set(false), 500);
  }

  private renderRouteOnMap(): void {
    const map = this.mapInstance;
    const route = this.route();
    if (!map || !route || route.coordinates.length < 2) {
      this.doneLoading();
      return;
    }

    const sourceId = 'detail-route-segments';
    const layerBaseId = 'detail-route-seg';

    const existingLayers = [`${layerBaseId}-casing`, layerBaseId, 'detail-hover-point-layer'];
    for (const id of existingLayers) {
      if (map.getLayer(id)) {
        map.removeLayer(id);
      }
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
    if (map.getSource('detail-hover-point')) {
      map.removeSource('detail-hover-point');
    }

    const segFeatures = this.buildSpeedSegments(route.coordinates, route.cumulativeDistances);

    // When there is no usable speed data (e.g. an imported track without timestamps, whose
    // average speed is 0), buildSpeedSegments returns an empty list and the route would not be
    // drawn. Fall back to a single solid-colour segment so the track is always visible, matching
    // the trail detail panel's behaviour.
    const routeFeatures =
      segFeatures.length > 0
        ? segFeatures
        : [
            {
              type: 'Feature' as const,
              properties: { speedRatio: 1 },
              geometry: { type: 'LineString' as const, coordinates: route.coordinates },
            },
          ];
    this.speedLegend.set(segFeatures.length > 0);

    const speedRatios = routeFeatures
      .map((f) => f.properties?.['speedRatio'] as number)
      .filter((v) => v !== undefined);
    const minRatio = speedRatios.length > 0 ? Math.min(...speedRatios) : 0.5;
    const maxRatio = speedRatios.length > 0 ? Math.max(...speedRatios) : 1.5;
    const range = maxRatio - minRatio || 0.5;

    const colorStops: (number | string)[] = [];
    for (const sc of SPEED_COLORS) {
      const t = sc.at / 2.0;
      const scaled = minRatio + t * range;
      colorStops.push(scaled, sc.color);
    }
    const interpolateExpr: ExpressionSpecification = [
      'interpolate',
      ['linear'],
      ['get', 'speedRatio'],
      ...colorStops,
    ];

    const routeData = { type: 'FeatureCollection' as const, features: routeFeatures };

    try {
      map.addSource(sourceId, { type: 'geojson', data: routeData });
    } catch {
      this.mapRerenderPending = true;
      if (!this.rerenderLoadHandler) {
        this.rerenderLoadHandler = () => {
          if (this.mapRerenderPending) {
            this.mapRerenderPending = false;
            this.renderRouteOnMap();
          }
        };
        map.once('load', this.rerenderLoadHandler);
      }
      return;
    }

    map.addLayer({
      id: `${layerBaseId}-casing`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.9,
        'line-width': 6,
      },
    });

    map.addLayer({
      id: layerBaseId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': interpolateExpr,
        'line-opacity': 0.9,
        'line-width': 4,
      },
    });

    map.addSource('detail-hover-point', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'detail-hover-point-layer',
      type: 'circle',
      source: 'detail-hover-point',
      paint: {
        'circle-color': '#14211b',
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    this.doneLoading();

    const coords = route.coordinates;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
      padding: 40,
      maxZoom: 15,
      duration: 0,
    });
  }

  private buildSpeedSegments(
    coords: [number, number][],
    cumulativeDistances?: number[],
  ): GeoJSON.Feature<GeoJSON.LineString>[] {
    const avgSpeedMs = this.speedMs();
    return buildSpeedSegments(coords, avgSpeedMs ?? 0, cumulativeDistances);
  }

  resizeMap(): void {
    setTimeout(() => this.mapInstance?.resize(), 50);
  }

  protected togglePanelExpand(): void {
    const expanded = !this.panelExpanded();
    this.panelExpanded.set(expanded);
    this.panelExpand.emit(expanded);
    setTimeout(() => {
      this.mapInstance?.resize();
    }, 100);
  }

  protected toggleLayerMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.layerMenuOpen.update((v) => !v);
  }

  protected selectLayer(config: BasemapProviderConfig): void {
    this.layerMenuOpen.set(false);
    if (config.id === this.activeLayerId()) {
      return;
    }
    this.activeLayerId.set(config.id);
    this.basemapProviderService.setProvider(config);
    const map = this.mapInstance;
    if (map) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const pitch = map.getPitch();
      const bearing = map.getBearing();
      map.setStyle(config.styleUrl!);

      // Poll until style is loaded (avoids unreliable load event with data: URLs)
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (map.isStyleLoaded() || attempts > 100) {
          clearInterval(poll);
          this.renderRouteOnMap();
          map.jumpTo({ center, zoom, pitch, bearing });
          import('maplibre-gl').then((ml) => {
            const NavControl =
              (ml as any).NavigationControl ?? (ml as any).default?.NavigationControl;
            const ScaleControl = (ml as any).ScaleControl ?? (ml as any).default?.ScaleControl;
            if (NavControl) {
              map.addControl(new NavControl({ showCompass: false }), 'top-left');
            }
            if (ScaleControl) {
              map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
            }
          });
        }
      }, 50);
    }
  }

  protected onElevationHover(pos: { lng: number; lat: number } | null): void {
    const map = this.mapInstance;
    if (!map) {
      return;
    }
    const source = map.getSource('detail-hover-point') as GeoJSONSource | undefined;
    if (!source) {
      return;
    }
    if (pos) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
            properties: {},
          },
        ],
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  protected downloadGpx(): void {
    const a = this.activity();
    if (!a) {
      return;
    }
    this.gpxExportService.exportActivity(a).then((result) => {
      if (!result.success) {
        this.toastService.show(result.reason);
      }
    });
  }

  protected showOnMapExplorer(): void {
    const a = this.activity();
    if (!a) {
      return;
    }
    this.router.navigate(['/map'], { queryParams: { activityId: a.id } });
  }

  protected showOnActivitiesTable(): void {
    const a = this.activity();
    if (!a) {
      return;
    }
    this.closePanel();
    this.router.navigate(['/logbook'], { queryParams: { focusActivityId: a.id } });
  }

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  protected openInStrava(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    const a = this.activity();
    if (!a || !a.providerActivityId) {
      return;
    }
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: `https://www.strava.com/activities/${a.providerActivityId}` });
    } else {
      window.open(`https://www.strava.com/activities/${a.providerActivityId}`, '_blank');
    }
  }

  protected async deleteActivity(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    this.menuOpen.set(false);
    const a = this.activity();
    if (!a) {
      return;
    }
    const confirmed = await this.confirmService.confirm({
      title: 'Delete activity',
      message: `Remove "${a.name}" and its route from the local database?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.close.emit();
    this.panelVisible.set(false);
    await this.repositories.activities.delete(a.id);
    await this.repositories.activityRoutes.delete(a.id);
    this.dataRefresh.emitRefresh();
  }

  protected async editActivity(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    this.menuOpen.set(false);
    const a = this.activity();
    if (!a) return;
    const ref = this.dialog.open(EditActivityDialog, {
      data: {
        currentName: a.name,
        currentSportType: a.sportType,
        currentActivityStatus: a.activityStatus ?? 'completed',
      },
      disableClose: true,
    });
    const result = await ref.afterClosed().toPromise();
    if (!result) return;
    if (
      result.name === a.name &&
      result.sportType === a.sportType &&
      result.activityStatus === (a.activityStatus ?? 'completed')
    )
      return;
    await this.repositories.activities.updateMetadata(a.id, {
      name: result.name,
      sportType: result.sportType,
      activityStatus: result.activityStatus,
    });
    this.dataRefresh.emitRefresh();
  }

  protected closePanel(): void {
    this.panelVisible.set(false);
    setTimeout(() => {
      this.mapInstance?.remove();
      this.mapInstance = null;
      this.mapInitialized.set(false);
      this.close.emit();
    }, 250);
  }
}

/** Rounds a bpm value to an integer, preserving `undefined` (no data). */
function roundBpm(bpm: number | undefined): number | undefined {
  return bpm === undefined ? undefined : Math.round(bpm);
}

import { Component, input, output, signal, effect, ElementRef, viewChild, inject, afterNextRender, computed } from '@angular/core';
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
import { formatSportType } from '../shared/activity-category';

function formatDistance(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === 0) { return '—'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) { return `${h}h ${m}m`; }
  return `${m}m`;
}

function formatSpeedKmh(speedMs: number | undefined): string {
  if (speedMs === undefined || speedMs === 0) { return '—'; }
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
}

function formatElevation(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${meters.toFixed(0)} m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SPAN_SECONDS = 120;
const SPEED_COLORS = [
  { at: 0, color: '#3b82c4' },
  { at: 0.5, color: '#5fb8a0' },
  { at: 0.8, color: '#78c679' },
  { at: 1.0, color: '#1f6f50' },
  { at: 1.2, color: '#d9a23d' },
  { at: 1.5, color: '#d9732b' },
  { at: 2.0, color: '#b8433a' },
];

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
  readonly route = input<ActivityRouteRecord & { coordinates: [number, number][]; elevations?: number[]; cumulativeDistances?: number[] } | null>(null);
  readonly pushMode = input(false);
  readonly showInActivities = input(false);
  readonly close = output<void>();
  readonly panelExpand = output<boolean>();

  protected readonly routeLoading = signal(false);
  protected readonly speedLegend = signal(false);
  protected readonly panelVisible = signal(false);
  protected readonly panelExpanded = signal(false);
  protected readonly layerMenuOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly activeLayerId = signal('openfreemap');
  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;

  protected readonly routeCoords = computed<[number, number][] | undefined>(() => this.route()?.coordinates ?? undefined);
  protected readonly routeElevations = computed<number[] | undefined>(() => this.route()?.elevations);
  protected readonly routeDistances = computed<number[] | undefined>(() => this.route()?.cumulativeDistances);

  protected readonly speedMs = computed(() => {
    const a = this.activity();
    if (!a) { return undefined; }
    if (a.averageSpeedMetersPerSecond) { return a.averageSpeedMetersPerSecond; }
    if (a.distanceMeters && a.movingTimeSeconds) { return a.distanceMeters / a.movingTimeSeconds; }
    return undefined;
  });

  protected readonly maxElevation = computed(() => {
    const el = this.routeElevations();
    if (!el || el.length === 0) { return this.activity()?.totalElevationGainMeters; }
    return Math.max(...el);
  });

  protected readonly startElevation = computed(() => {
    const el = this.routeElevations();
    if (!el || el.length === 0) { return undefined; }
    return el[0];
  });

  protected readonly calories = computed(() => {
    const a = this.activity();
    if (!a) { return '—'; }
    return (a as any).calories ?? '—';
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
  }

  protected readonly formatDate = formatDate;
  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatSpeedKmh = formatSpeedKmh;
  protected readonly formatElevation = formatElevation;
  protected readonly formatSportType = formatSportType;

  private initMap(): void {
    if (this.mapInitialized()) { return; }
    this.mapInitialized.set(true);
    this.routeLoading.set(true);
    const container = this.mapContainer()?.nativeElement;
    if (!container) { return; }
    const provider = this.basemapProviderService.getDefaultProvider();
    this.mapLibreService.createMap(container, provider).then((map) => {
      this.mapInstance = map;
      map.jumpTo({ center: [0, 20], zoom: 2 });
      import('maplibre-gl').then((ml) => {
        const NavControl = (ml as any).NavigationControl ?? (ml as any).default?.NavigationControl;
        const ScaleControl = (ml as any).ScaleControl ?? (ml as any).default?.ScaleControl;
        if (NavControl) { map.addControl(new NavControl({ showCompass: false }), 'top-left'); }
        if (ScaleControl) { map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left'); }
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
      if (map.getLayer(id)) { map.removeLayer(id); }
    }
    if (map.getSource(sourceId)) { map.removeSource(sourceId); }
    if (map.getSource('detail-hover-point')) { map.removeSource('detail-hover-point'); }

    const segFeatures = this.buildSpeedSegments(route.coordinates, route.cumulativeDistances);
    this.speedLegend.set(segFeatures.length > 0);

    const speedRatios = segFeatures
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
    const interpolateExpr: ExpressionSpecification = ['interpolate', ['linear'], ['get', 'speedRatio'], ...colorStops];


    const routeData = { type: 'FeatureCollection' as const, features: segFeatures };

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
    map.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: 40, maxZoom: 15, duration: 0 },
    );
  }

  private buildSpeedSegments(
    coords: [number, number][],
    cumulativeDistances?: number[],
  ): GeoJSON.Feature<GeoJSON.LineString>[] {
    if (coords.length < 2) { return []; }

    const avgSpeedMs = this.speedMs();
    if (!avgSpeedMs || avgSpeedMs <= 0) { return []; }

    const spanMeters = Math.max(50, avgSpeedMs * SPAN_SECONDS);

    const spans: { startIdx: number; endIdx: number; dist: number }[] = [];
    let spanStart = 0;
    let spanDist = 0;
    for (let i = 1; i < coords.length; i++) {
      const segDist = cumulativeDistances
        ? (cumulativeDistances[i] ?? 0) - (cumulativeDistances[i - 1] ?? 0)
        : haversineDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      spanDist += segDist;
      if (spanDist >= spanMeters || i === coords.length - 1) {
        spans.push({ startIdx: spanStart, endIdx: i, dist: spanDist });
        spanStart = i;
        spanDist = 0;
      }
    }

    if (spans.length < 2) { return []; }

    const pointCounts = spans.map((s) => s.endIdx - s.startIdx + 1);
    const avgPoints = pointCounts.reduce((s, c) => s + c, 0) / pointCounts.length;

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const span of spans) {
      const coordsInSpan = coords.slice(span.startIdx, span.endIdx + 1);
      if (coordsInSpan.length < 2) { continue; }

      const pointDensity = span.dist > 0 ? coordsInSpan.length / span.dist : 0;
      const normDensity = avgPoints > 0 ? pointDensity / (avgPoints / spanMeters) : 1;
      const speedRatio = normDensity > 0 ? 1 / normDensity : 2;

      features.push({
        type: 'Feature',
        properties: { speedRatio: Math.max(0.1, Math.min(3, speedRatio)) },
        geometry: {
          type: 'LineString',
          coordinates: coordsInSpan,
        },
      });
    }

    return features;
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
    if (config.id === this.activeLayerId()) { return; }
    this.activeLayerId.set(config.id);
    this.basemapProviderService.setProvider(config);
    const map = this.mapInstance;
    if (map) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const pitch = map.getPitch();
      const bearing = map.getBearing();
      map.setStyle(config.styleUrl!);
      map.once('style.load', () => {
        this.renderRouteOnMap();
        map.jumpTo({ center, zoom, pitch, bearing });
        import('maplibre-gl').then((ml) => {
          map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
          map.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');
        });
      });
    }
  }

  protected onElevationHover(pos: { lng: number; lat: number } | null): void {
    const map = this.mapInstance;
    if (!map) { return; }
    const source = map.getSource('detail-hover-point') as GeoJSONSource | undefined;
    if (!source) { return; }
    if (pos) {
      source.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] }, properties: {} }],
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  protected downloadGpx(): void {
    const a = this.activity();
    if (!a) { return; }
    this.gpxExportService.exportActivity(a).then((result) => {
      if (!result.success) {
        this.toastService.show(result.reason);
      }
    });
  }

  protected showOnMapExplorer(): void {
    const a = this.activity();
    if (!a) { return; }
    this.router.navigate(['/map'], { queryParams: { activityId: a.id } });
  }

  protected showOnActivitiesTable(): void {
    const a = this.activity();
    if (!a) { return; }
    this.closePanel();
    this.router.navigate(['/activities'], { queryParams: { focusActivityId: a.id } });
  }

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  protected openInStrava(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    const a = this.activity();
    if (!a || !a.providerActivityId) { return; }
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
    if (!a) { return; }
    const confirmed = await this.confirmService.confirm({
      title: 'Delete activity',
      message: `Remove "${a.name}" and its route from the local database?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) { return; }
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
    if (result.name === a.name && result.sportType === a.sportType && result.activityStatus === (a.activityStatus ?? 'completed')) return;
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

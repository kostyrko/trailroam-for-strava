import {
  Component,
  computed,
  input,
  output,
  signal,
  afterNextRender,
  viewChild,
  ElementRef,
  inject,
  effect,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl';
import { IconComponent } from '../shared/icon.component';
import { RouteSparklineComponent } from '../activities/route-sparkline.component';
import { CreateTrailDialog } from '../activities/create-trail-dialog.component';
import type { ActivityRecord } from '../storage/storage.models';
import type { SidebarTrailItem } from './map-activity-panel.component';
import type { MapRouteFeature } from './mock-routes';
import {
  formatDistance,
  formatDuration,
  formatDurationHours,
  formatElevation,
  formatDate,
  formatDateShort,
} from '../shared/formatters';
import { sportTypeEmojiFromString } from '../shared/activity-display';
import { MapLibreService } from './maplibre.service';
import { BasemapProviderService, AVAILABLE_PROVIDERS } from './basemap-provider.service';
import type { BasemapProviderConfig } from './basemap-provider';
import { TrailsService } from '../storage/trails.service';
import { ConfirmService } from '../shared/confirm.service';
import { ToastService } from '../shared/toast.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';

/* ── Speed-colour helpers (mirrored from activity-detail-panel) ──── */

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

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildSpeedSegments(
  coords: [number, number][],
  avgSpeedMs: number,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (coords.length < 2 || !avgSpeedMs || avgSpeedMs <= 0) return [];
  const spanMeters = Math.max(50, avgSpeedMs * SPAN_SECONDS);
  const spans: { startIdx: number; endIdx: number; dist: number }[] = [];
  let spanStart = 0;
  let spanDist = 0;
  for (let i = 1; i < coords.length; i++) {
    const segDist = haversineDistance(
      coords[i - 1][0],
      coords[i - 1][1],
      coords[i][0],
      coords[i][1],
    );
    spanDist += segDist;
    if (spanDist >= spanMeters || i === coords.length - 1) {
      spans.push({ startIdx: spanStart, endIdx: i, dist: spanDist });
      spanStart = i;
      spanDist = 0;
    }
  }
  if (spans.length < 2) return [];
  const pointCounts = spans.map((s) => s.endIdx - s.startIdx + 1);
  const avgPoints = pointCounts.reduce((s, c) => s + c, 0) / pointCounts.length;
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const span of spans) {
    const coordsInSpan = coords.slice(span.startIdx, span.endIdx + 1);
    if (coordsInSpan.length < 2) continue;
    const pointDensity = span.dist > 0 ? coordsInSpan.length / span.dist : 0;
    const normDensity = avgPoints > 0 ? pointDensity / (avgPoints / spanMeters) : 1;
    const speedRatio = normDensity > 0 ? 1 / normDensity : 2;
    features.push({
      type: 'Feature',
      properties: { speedRatio: Math.max(0.1, Math.min(3, speedRatio)) },
      geometry: { type: 'LineString', coordinates: coordsInSpan },
    });
  }
  return features;
}

function dayCount(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  const diff = d2.getTime() - d1.getTime();
  return Math.max(1, Math.round(diff / 86400000) + 1);
}

@Component({
  selector: 'app-trail-detail-panel',
  imports: [IconComponent, RouteSparklineComponent],
  templateUrl: './trail-detail-panel.component.html',
  styleUrl: './trail-detail-panel.component.scss',
})
export class TrailDetailPanelComponent {
  private readonly router = inject(Router);
  private readonly mapLibreService = inject(MapLibreService);
  private readonly basemapProviderService = inject(BasemapProviderService);
  private readonly trailsService = inject(TrailsService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly dialog = inject(MatDialog);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  readonly trail = input.required<SidebarTrailItem>();
  readonly allRoutes = input<MapRouteFeature[]>([]);

  readonly selectActivity = output<MapRouteFeature>();
  readonly fitToTrail = output<void>();
  readonly close = output<void>();
  readonly hoveredActivityId = output<string | null>();

  private readonly miniMapContainer = viewChild<ElementRef<HTMLDivElement>>('miniMapContainer');
  private mapInstance: MapLibreMap | null = null;
  private readonly mapReady = signal(false);
  protected readonly mapExpanded = signal(false);
  protected readonly speedLegend = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly layerMenuOpen = signal(false);
  protected readonly activeLayerId = signal('openfreemap');
  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;

  /* ── Computed ─────────────────────────────────── */

  protected readonly days = computed(() => {
    const t = this.trail();
    return dayCount(t.firstDate, t.lastDate);
  });

  protected readonly routeLookup = computed<Map<string, MapRouteFeature>>(() => {
    const map = new Map<string, MapRouteFeature>();
    for (const r of this.allRoutes()) {
      map.set(r.activityId, r);
    }
    return map;
  });

  private readonly allTrailCoords = computed<[number, number][]>(() => {
    const t = this.trail();
    const result: [number, number][] = [];
    for (const member of t.memberActivities) {
      const route = this.routeLookup().get(member.activityId);
      if (route?.coordinates) {
        result.push(...route.coordinates);
      }
    }
    return result;
  });

  /* ── Insights ─────────────────────────────────── */

  protected readonly highestElevation = computed(() => {
    return Math.max(
      0,
      ...this.trail().memberActivities.map((r) => r.activity.totalElevationGainMeters ?? 0),
    );
  });

  protected readonly longestActivity = computed(() => {
    return Math.max(0, ...this.trail().memberActivities.map((r) => r.activity.distanceMeters ?? 0));
  });

  protected readonly avgDistancePerDay = computed(() => {
    const d = this.days();
    const total = this.trail().totalDistanceMeters;
    return d > 0 ? total / d : 0;
  });

  protected readonly totalElevation = computed(() => {
    return this.trail().memberActivities.reduce(
      (s, r) => s + (r.activity.totalElevationGainMeters ?? 0),
      0,
    );
  });

  /* ── Formatting ───────────────────────────────── */

  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDurationHours = formatDurationHours;
  protected readonly formatElevation = formatElevation;
  protected readonly formatDate = formatDate;
  protected readonly formatDateShort = formatDateShort;
  protected readonly sportTypeEmojiFromString = sportTypeEmojiFromString;

  constructor() {
    afterNextRender(() => this.initMiniMap());

    effect(() => {
      this.trail();
      this.allRoutes();
      if (this.mapReady() && this.mapInstance) {
        this.renderMiniMapRoutes();
      }
    });

    globalThis.addEventListener('click', () => {
      this.layerMenuOpen.set(false);
      this.menuOpen.set(false);
    });
  }

  /* ── Template helpers ─────────────────────────── */

  protected isLast(index: number, total: number): boolean {
    return index >= total - 1;
  }

  protected isFirstOfDay(index: number, members: SidebarTrailItem['memberActivities']): boolean {
    if (index === 0) return true;
    const prev = new Date(members[index - 1].activity.startDate).toDateString();
    const cur = new Date(members[index].activity.startDate).toDateString();
    return prev !== cur;
  }

  protected dayIndex(index: number, members: SidebarTrailItem['memberActivities']): number {
    let day = 1;
    for (let i = 0; i <= index; i++) {
      if (i > 0) {
        const prev = new Date(members[i - 1].activity.startDate).toDateString();
        const cur = new Date(members[i].activity.startDate).toDateString();
        if (prev !== cur) day++;
      }
    }
    return day;
  }

  /* ── Event handlers ───────────────────────────── */

  protected onActivityClick(route: MapRouteFeature): void {
    this.selectActivity.emit(route);
  }

  protected onActivityHover(route: MapRouteFeature | null): void {
    this.hoveredActivityId.emit(route?.activityId ?? null);
  }

  protected onMiniMapClick(): void {
    this.fitToTrail.emit();
  }

  protected toggleMapExpand(): void {
    this.mapExpanded.update((v) => !v);
    setTimeout(() => this.mapInstance?.resize(), 100);
  }

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  protected toggleLayerMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.layerMenuOpen.update((v) => !v);
  }

  protected selectLayer(config: BasemapProviderConfig): void {
    this.layerMenuOpen.set(false);
    if (config.id === this.activeLayerId()) return;

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
        this.renderMiniMapRoutes();
        map.jumpTo({ center, zoom, pitch, bearing });
        import('maplibre-gl').then((ml) => {
          map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
          map.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');
        });
      });
    }
  }

  protected async onEditTrail(): Promise<void> {
    this.menuOpen.set(false);
    const t = this.trail();
    const trailRec = t.trail;
    const memberActivities = t.memberActivities.map((m) => m.activity);
    const allActivities: ActivityRecord[] = (await this.repositories.activities.list()) ?? [];

    const { CreateTrailDialog } = await import('../activities/create-trail-dialog.component');
    const ref = this.dialog.open(CreateTrailDialog, {
      data: {
        activities: memberActivities,
        allActivities,
        suggestedName: trailRec.name,
        trail: trailRec,
      },
      disableClose: true,
    });
    const result: { name: string; activityIds: string[]; trailId?: string } | undefined = await ref
      .afterClosed()
      .toPromise();
    if (!result) return;

    try {
      const nameChanged = result.name !== trailRec.name;
      const oldIds = new Set(trailRec.activityIds);
      const newIdsSet = new Set(result.activityIds);
      const toRemove = trailRec.activityIds.filter((id) => !newIdsSet.has(id));
      const toAdd = result.activityIds.filter((id) => !oldIds.has(id));

      if (nameChanged) {
        await this.trailsService.rename(trailRec.id, result.name);
      }
      for (const id of toRemove) {
        await this.trailsService.removeFromTrail(trailRec.id, id);
      }
      for (const id of toAdd) {
        await this.trailsService.addToTrail(trailRec.id, id);
      }

      this.dataRefresh.emitRefresh();
      this.toastService.show(`Trail "${result.name}" updated.`);
    } catch {
      this.toastService.show('Failed to update Trail.');
    }
  }

  protected async onDeleteTrail(): Promise<void> {
    this.menuOpen.set(false);
    const t = this.trail().trail;
    const confirmed = await this.confirmService.confirm({
      title: 'Delete Trail?',
      message: 'This removes the grouping only. Activities will remain in your library.',
      confirmLabel: 'Delete Trail',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.trailsService.remove(t.id);
      this.dataRefresh.emitRefresh();
      this.toastService.show(`Trail "${t.name}" deleted.`);
      this.close.emit();
    } catch {
      this.toastService.show('Failed to delete trail.');
    }
  }

  protected openInLogbook(): void {
    this.router.navigate(['/logbook'], {
      queryParams: { trailId: this.trail().trail.id },
    });
  }

  protected getRouteCoords(activityId: string): [number, number][] | null {
    return this.routeLookup().get(activityId)?.coordinates ?? null;
  }

  protected getRouteForActivity(activityId: string): MapRouteFeature | undefined {
    return this.routeLookup().get(activityId);
  }

  private avgSpeedMs(route: MapRouteFeature): number | undefined {
    const a = route.activity;
    if (a.averageSpeedMetersPerSecond) return a.averageSpeedMetersPerSecond;
    if (a.distanceMeters && a.movingTimeSeconds) return a.distanceMeters / a.movingTimeSeconds;
    return undefined;
  }

  /* ── Mini map ─────────────────────────────────── */

  private async initMiniMap(): Promise<void> {
    if (this.mapReady()) return;
    const container = this.miniMapContainer()?.nativeElement;
    if (!container) return;

    const provider = this.basemapProviderService.getDefaultProvider();
    const map = await this.mapLibreService.createMap(container, provider);
    this.mapInstance = map;

    map.dragPan.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.keyboard.enable();

    // Add navigation controls (zoom +/-) and scale
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

    this.mapReady.set(true);

    const doRender = () => this.renderMiniMapRoutes();
    if (map.isStyleLoaded()) {
      doRender();
    } else {
      map.once('load', doRender);
    }
  }

  private renderMiniMapRoutes(): void {
    const map = this.mapInstance;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('load', () => this.renderMiniMapRoutes());
      return;
    }

    const coords = this.allTrailCoords();
    const t = this.trail();
    if (coords.length < 2) return;

    // Build speed-colored segments for each activity
    let allSegments: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const member of t.memberActivities) {
      const route = this.routeLookup().get(member.activityId);
      if (!route?.coordinates || route.coordinates.length < 2) continue;
      const avgMs = this.avgSpeedMs(route);
      if (avgMs) {
        const segs = buildSpeedSegments(route.coordinates, avgMs);
        allSegments.push(...segs);
      } else {
        // Fallback: single segment per activity without speed data
        allSegments.push({
          type: 'Feature',
          properties: { speedRatio: 1 },
          geometry: { type: 'LineString', coordinates: route.coordinates },
        });
      }
    }

    if (allSegments.length === 0) {
      this.speedLegend.set(false);
      return;
    }

    this.speedLegend.set(allSegments.length > 0);

    // Compute global min/max speed ratios for the color ramp
    const ratios = allSegments
      .map((f) => f.properties?.['speedRatio'] as number)
      .filter((v) => v !== undefined);
    const minRatio = ratios.length > 0 ? Math.min(...ratios) : 0.5;
    const maxRatio = ratios.length > 0 ? Math.max(...ratios) : 1.5;
    const range = maxRatio - minRatio || 0.5;

    const colorStops: (number | string)[] = [];
    for (const sc of SPEED_COLORS) {
      const tNorm = sc.at / 2.0;
      const scaled = minRatio + tNorm * range;
      colorStops.push(scaled, sc.color);
    }
    const interpolateExpr: ExpressionSpecification = [
      'interpolate',
      ['linear'],
      ['get', 'speedRatio'],
      ...colorStops,
    ];

    const sourceId = 'trail-minimap-routes';
    const casingLayerId = 'trail-minimap-casing';
    const lineLayerId = 'trail-minimap-line';

    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getLayer(casingLayerId)) map.removeLayer(casingLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: allSegments },
    });

    map.addLayer({
      id: casingLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.9,
        'line-width': 6,
      },
    });

    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': interpolateExpr,
        'line-opacity': 0.9,
        'line-width': 4,
      },
    });

    map.fitBounds(
      [
        Math.min(...coords.map((c) => c[0])),
        Math.min(...coords.map((c) => c[1])),
        Math.max(...coords.map((c) => c[0])),
        Math.max(...coords.map((c) => c[1])),
      ],
      { padding: 10, maxZoom: 15, duration: 0 },
    );
  }
}

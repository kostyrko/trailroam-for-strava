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
  DestroyRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import type { Map as MapLibreMap, ExpressionSpecification, GeoJSONSource } from 'maplibre-gl';
import { IconComponent } from '../shared/icon.component';
import { RouteSparklineComponent } from '../activities/route-sparkline.component';
import { ElevationProfileComponent } from './elevation-profile.component';
import { CreateTrailDialog } from '../activities/create-trail-dialog.component';
import type { ActivityRecord, RouteGeometryRecord } from '../storage/storage.models';
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
import { GpxExportService } from '../shared/gpx-export.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { SPEED_COLORS, buildSpeedSegments } from '../shared/speed-segments';

function dayCount(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  const diff = d2.getTime() - d1.getTime();
  return Math.max(1, Math.round(diff / 86400000) + 1);
}

@Component({
  selector: 'app-trail-detail-panel',
  imports: [IconComponent, RouteSparklineComponent, ElevationProfileComponent],
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
  private readonly gpxExportService = inject(GpxExportService);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly destroyRef = inject(DestroyRef);

  readonly trail = input.required<SidebarTrailItem>();
  readonly allRoutes = input<MapRouteFeature[]>([]);

  readonly selectActivity = output<MapRouteFeature>();
  readonly fitToTrail = output<void>();
  readonly close = output<void>();
  readonly hoveredActivityId = output<string | null>();
  readonly mapExpandChange = output<boolean>();

  private readonly miniMapContainer = viewChild<ElementRef<HTMLDivElement>>('miniMapContainer');
  private mapInstance: MapLibreMap | null = null;
  private readonly mapReady = signal(false);
  protected readonly mapExpanded = signal(false);
  protected readonly speedLegend = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly layerMenuOpen = signal(false);
  protected readonly activeLayerId = signal('openfreemap');
  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;

  /* ── Trail-level elevation profile ──────────── */

  private readonly trailGeometry = signal<RouteGeometryRecord | null>(null);
  private abortGeometryFetch: (() => void) | null = null;

  protected readonly trailElevations = computed<number[] | undefined>(
    () => this.trailGeometry()?.elevations,
  );
  protected readonly trailCumulativeDistances = computed<number[] | undefined>(
    () => this.trailGeometry()?.cumulativeDistances,
  );
  protected readonly trailCoords = computed<[number, number][] | undefined>(
    () => this.trailGeometry()?.coordinates,
  );
  protected readonly trailTotalDistanceMeters = computed(() => {
    const dists = this.trailCumulativeDistances();
    return dists && dists.length > 0 ? dists[dists.length - 1] : this.trail().totalDistanceMeters;
  });

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

  /** All activities (needed by onEditTrail to populate the dialog picker). */
  readonly allActivities = input<ActivityRecord[]>([]);

  constructor() {
    afterNextRender(() => this.initMiniMap());

    effect(() => {
      this.trail();
      this.allRoutes();
      if (this.mapReady() && this.mapInstance) {
        this.renderMiniMapRoutes();
      }
    });

    effect(() => {
      const t = this.trail();
      const routes = this.allRoutes();
      this.loadTrailGeometry(t, routes);
    });

    // Close overflow menus when clicking outside — clean up on destroy.
    const clickHandler = (): void => {
      this.layerMenuOpen.set(false);
      this.menuOpen.set(false);
    };
    globalThis.addEventListener('click', clickHandler);
    this.destroyRef.onDestroy(() => globalThis.removeEventListener('click', clickHandler));
  }

  /* ── Trail elevation geometry loader ──────────── */

  private async loadTrailGeometry(
    trail: SidebarTrailItem,
    allRoutes: MapRouteFeature[],
  ): Promise<void> {
    // Abort any in-flight fetch for a previous trail
    this.abortGeometryFetch?.();
    let cancelled = false;
    this.abortGeometryFetch = () => {
      cancelled = true;
    };

    const members = trail.memberActivities;
    if (members.length === 0) {
      this.trailGeometry.set(null);
      return;
    }

    const geometries = await Promise.all(
      members.map((m) => this.repositories.routeGeometry.get(m.activityId)),
    );

    if (cancelled) return;

    const validGeos = geometries.filter((g): g is RouteGeometryRecord => !!g);
    if (validGeos.length === 0) {
      this.trailGeometry.set(null);
      return;
    }

    // Combine all geometries into one continuous profile
    const allElevations: number[] = [];
    const allDistances: number[] = [];
    const allCoords: [number, number][] = [];
    let offset = 0;

    for (const geo of validGeos) {
      if (geo.elevations && geo.cumulativeDistances && geo.elevations.length > 0) {
        for (let i = 0; i < geo.elevations.length; i++) {
          allElevations.push(geo.elevations[i]);
          allDistances.push((geo.cumulativeDistances[i] ?? 0) + offset);
        }
        offset += geo.cumulativeDistances[geo.cumulativeDistances.length - 1] ?? 0;
        if (geo.coordinates) {
          allCoords.push(...geo.coordinates);
        }
      }
    }

    if (allElevations.length === 0) {
      this.trailGeometry.set(null);
      return;
    }

    this.trailGeometry.set({
      activityId: trail.trail.id,
      providerActivityId: '',
      coordinates: allCoords,
      elevations: allElevations,
      cumulativeDistances: allDistances,
      syncedAt: '',
      updatedAt: '',
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
    const expanded = !this.mapExpanded();
    this.mapExpanded.set(expanded);
    this.mapExpandChange.emit(expanded);
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

      // Poll until the style is loaded (avoids unreliable load event with data: URLs)
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (map.isStyleLoaded() || attempts > 100) {
          clearInterval(poll);
          this.renderMiniMapRoutes();
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

  protected async onEditTrail(): Promise<void> {
    this.menuOpen.set(false);
    const t = this.trail();
    const trailRec = t.trail;
    const memberActivities = t.memberActivities.map((m) => m.activity);
    const allActivities = this.allActivities();

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

  protected async exportGpx(): Promise<void> {
    const t = this.trail();
    const segments = t.memberActivities.map((m) => ({
      name: m.activity.name,
      startDate: m.activity.startDate,
      activityId: m.activityId,
    }));
    const result = await this.gpxExportService.exportTrail(t.trail.name, segments);
    if (!result.success) {
      this.toastService.show(result.reason);
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

    const doRender = () => {
      this.renderMiniMapRoutes();
      this.addTrailHoverPointLayer();
    };
    if (map.isStyleLoaded()) {
      doRender();
    } else {
      map.once('load', doRender);
    }
  }

  /* ── Elevation hover dot on mini map ─────────── */

  private addTrailHoverPointLayer(): void {
    const map = this.mapInstance;
    if (!map || map.getSource('trail-hover-point')) return;
    map.addSource('trail-hover-point', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'trail-hover-point-layer',
      type: 'circle',
      source: 'trail-hover-point',
      paint: {
        'circle-color': '#14211b',
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }

  protected onTrailElevationHover(pos: { lng: number; lat: number } | null): void {
    const map = this.mapInstance;
    if (!map) return;
    const source = map.getSource('trail-hover-point') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      pos
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
                properties: {},
              },
            ],
          }
        : { type: 'FeatureCollection', features: [] },
    );
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

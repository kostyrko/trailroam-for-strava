import {
  AfterViewInit,
  Component,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { MapLibreMapComponent } from './maplibre-map.component';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { DateRangePickerComponent } from '../shared/date-range-picker.component';
import { type MapRouteFeature } from './mock-routes';
import {
  FiltersService,
  CATEGORY_COLORS,
  isAfterOrEqual,
  isBeforeOrEqual,
  type DatePreset,
} from '../shared/filters.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { MatDialog } from '@angular/material/dialog';
import { EditActivityDialog } from '../shared/edit-activity-dialog.component';
import { SavePlaceDialog, type SavePlaceDialogData } from '../shared/save-place-dialog.component';
import type { SearchSelectedPayload } from './map-search-panel.component';
import type { GeocodeResult } from './geocoding.service';
import { RouteRendererService } from './route-renderer.service';
import { type ActivityCategory } from '../storage/storage.models';
import {
  formatSportType,
  formatCategory,
  mapSportTypeToCategory,
} from '../shared/activity-category';
import {
  formatDurationHours,
  formatDistance,
  formatElevation,
  computeSpeed,
  formatSpeed,
  formatDuration,
  formatDate,
  fmtDate,
} from '../shared/formatters';
import { ToastService } from '../shared/toast.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { GpxExportService } from '../shared/gpx-export.service';
import { ConfirmService } from '../shared/confirm.service';
import { IconComponent } from '../shared/icon.component';
import { ActivityCardComponent } from './activity-card.component';
import { ActivityDetailPanelComponent } from '../activities/activity-detail-panel.component';
import { MapActivityPanelComponent } from './map-activity-panel.component';
import { MapNoticeBannersComponent } from './map-notice-banners.component';
import { MapFilterOverlayComponent } from './map-filter-overlay.component';
import { MapPlacesPanelComponent } from './map-places-panel.component';
import { MapAllPanelComponent } from './map-all-panel.component';
import { SavedPlacesService } from './saved-places.service';
import { GeocodingService } from './geocoding.service';
import { logger } from '../shared/logger';

const ROUTES_WARN_THRESHOLD = 1_000;
const POINTS_WARN_THRESHOLD = 1_000_000;

@Component({
  selector: 'app-map-page',
  imports: [
    MapLibreMapComponent,
    LoadingSpinnerComponent,
    ActivityCardComponent,
    ActivityDetailPanelComponent,
    MapActivityPanelComponent,
    MapNoticeBannersComponent,
    MapFilterOverlayComponent,
    MapPlacesPanelComponent,
    MapAllPanelComponent,
  ],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.scss',
})
export class MapPage implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  protected readonly filtersService = inject(FiltersService);
  protected readonly routeRendererService = inject(RouteRendererService);
  private readonly toastService = inject(ToastService);
  private readonly gpxExportService = inject(GpxExportService);
  private readonly confirmService = inject(ConfirmService);
  private readonly dialog = inject(MatDialog);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly savedPlacesService = inject(SavedPlacesService);
  private readonly geocodingService = inject(GeocodingService);

  protected readonly CATEGORY_COLORS = CATEGORY_COLORS;

  @ViewChild(MapLibreMapComponent)
  private readonly mapComponent!: MapLibreMapComponent;
  @ViewChild('activityPanel')
  private readonly activityPanel?: MapActivityPanelComponent;

  private readonly activityIdParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('activityId'))),
    { initialValue: null },
  );
  private readonly placeIdParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('placeId'))),
    { initialValue: null },
  );
  private readonly fromParam = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const v = params.get('from');
        if (v === 'places' || v === 'all') return v;
        return null;
      }),
    ),
    { initialValue: null },
  );
  private readonly basemapErrorParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('basemapError') === 'true')),
    { initialValue: false },
  );
  private readonly mapBasemapError = signal(false);
  protected readonly allRoutes = signal<MapRouteFeature[]>([]);
  private readonly selectedMapRoute = signal<MapRouteFeature | null>(null);
  protected readonly detailPanelOpen = signal(false);
  protected readonly detailPanelExpanded = signal(false);
  protected readonly filterMenuOpen = signal(false);
  protected readonly mapFullscreen = signal(false);
  private readonly perfWarningDismissed = signal(false);
  private readonly autoFilterHintDismissed = signal(false);
  protected readonly autoFilterHighlight = signal(false);
  private readonly dataLoaded = signal(false);
  private readonly mapReady = signal(false);
  private readonly retryDestroyed = signal(false);
  private renderRetryCount = 0;
  private readonly MAX_RENDER_RETRIES = 20;

  protected readonly routesLoading = signal(true);
  protected readonly filterLoading = signal(false);
  protected readonly routesRendered = signal(false);
  protected readonly mapEmptyDismissed = signal(false);
  protected dismissMapEmpty(): void {
    this.mapEmptyDismissed.set(true);
  }

  protected readonly sportTypeFilter = this.filtersService.sportTypeFilter;
  protected readonly hoveredActivityId = signal<string | null>(null);
  /** Persisted placeId target from URL params — survives param cleanup so the effect works across map-ready state changes. */
  protected readonly pendingPlaceId = signal<string | null>(null);
  private readonly pendingPlaceSource = signal<'places' | 'all' | null>(null);
  /** When true, the routes-loading spinner is suppressed (used when navigating to focus a place, not routes). */
  protected readonly placeNavigationActive = signal(false);

  /** Activities | Places | All segmented-control state for the left panel. */
  protected readonly leftPanelView = signal<'activities' | 'places' | 'all'>('activities');
  /** Id of the place currently focused on the map (for panel row highlight). */
  protected readonly selectedPlaceId = signal<string | null>(null);
  /** The search result the user just selected (drives the save flow + "Saved" badge). */
  protected readonly selectedSearchResult = signal<GeocodeResult | null>(null);
  protected readonly panelVisibleOnMap = signal(false);
  protected readonly panelViewportBounds = signal<[[number, number], [number, number]] | null>(
    null,
  );
  protected readonly panelExpanded = signal(true);
  protected readonly panelNoTransition = signal(true);
  protected readonly panelReady = signal(false);
  private panelLoaded = false;
  private emphasisTimeout: ReturnType<typeof setTimeout> | null = null;

  protected readonly datePreset = this.filtersService.datePreset;
  protected readonly datePresetLabel = this.filtersService.datePresetLabel;
  protected readonly datePresetOpen = signal(false);

  protected applyDatePreset(preset: DatePreset): void {
    this.filtersService.setDatePreset(preset);
    this.datePresetOpen.set(false);
    if (preset === 'all') {
      this.filtersService.setDateFrom('');
      this.filtersService.setDateTo('');
      return;
    }
    if (preset === 'custom') {
      const routes = this.allRoutes();
      if (routes.length > 0) {
        const dates = routes
          .map((r) => new Date(r.activity.startDate).getTime())
          .filter((t) => !isNaN(t));
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates));
          const maxDate = new Date(Math.max(...dates));
          this.filtersService.setDateFrom(minDate.toISOString().slice(0, 10));
          this.filtersService.setDateTo(maxDate.toISOString().slice(0, 10));
        }
      }
      return;
    }
    const now = new Date();
    let from: Date;
    if (preset === '7d') {
      from = new Date(now);
      from.setDate(from.getDate() - 7);
    } else if (preset === '30d') {
      from = new Date(now);
      from.setDate(from.getDate() - 30);
    } else {
      from = new Date(now.getFullYear(), 0, 1);
    }
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = now.toISOString().slice(0, 10);
    this.filtersService.setDateFrom(fromStr);
    this.filtersService.setDateTo(toStr);
  }

  protected onRangeApplied(range: { dateFrom: string; dateTo: string }): void {
    if (range.dateFrom && range.dateTo) {
      const preset = this.matchPreset(range.dateFrom, range.dateTo);
      this.filtersService.setDatePreset(preset);
      this.filtersService.setDateFrom(range.dateFrom);
      this.filtersService.setDateTo(range.dateTo);
    } else {
      this.filtersService.setDatePreset('all');
      this.filtersService.setDateFrom('');
      this.filtersService.setDateTo('');
    }
    this.datePresetOpen.set(false);
  }

  private matchPreset(dateFrom: string, dateTo: string): DatePreset {
    if (!dateFrom && !dateTo) return 'all';
    const now = new Date();
    const today = fmtDate(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenAgo = new Date(now);
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    if (dateFrom === today && dateTo === today) return 'today';
    if (dateFrom === fmtDate(yesterday) && dateTo === today) return 'yesterday';
    if (dateFrom === fmtDate(sevenAgo) && dateTo === today) return '7d';
    if (dateFrom === fmtDate(thirtyAgo) && dateTo === today) return '30d';
    if (dateFrom === fmtDate(monthStart) && dateTo === today) return 'month';
    if (dateFrom === fmtDate(yearStart) && dateTo === today) return 'year';
    return 'custom';
  }

  protected onNameSearchChange(value: string): void {
    this.filtersService.setNameSearch(value);
  }

  protected readonly sportTypeGroups = computed<
    { category: ActivityCategory; sportTypes: string[] }[]
  >(() => {
    const routes = this.allRoutes();
    const seen = new Set<string>();
    const groups = new Map<ActivityCategory, Set<string>>();
    for (const r of routes) {
      if (seen.has(r.activity.sportType)) {
        continue;
      }
      seen.add(r.activity.sportType);
      const cat = mapSportTypeToCategory(r.activity.sportType);
      if (!groups.has(cat)) {
        groups.set(cat, new Set());
      }
      groups.get(cat)!.add(r.activity.sportType);
    }
    const order: ActivityCategory[] = [
      'ride',
      'run',
      'walk',
      'water',
      'paddling',
      'winter',
      'other',
    ];
    return order
      .filter((cat) => groups.has(cat))
      .map((cat) => ({ category: cat, sportTypes: [...groups.get(cat)!].sort() }));
  });

  protected readonly filteredRoutes = computed(() => {
    const routes = this.allRoutes();
    const sportFilter = this.sportTypeFilter();
    const fromDate = this.filtersService.dateFrom();
    const toDate = this.filtersService.dateTo();
    const search = this.filtersService.nameSearch().toLowerCase().trim();
    const srcFilter = this.mapSourceFilter();
    return routes.filter((r) => {
      if (srcFilter.size > 0) {
        const isStrava = r.activity.provider === 'strava';
        const isPlanned = r.activity.activityStatus === 'planned';
        const matchesSource =
          (srcFilter.has('strava') && isStrava) ||
          (srcFilter.has('imported') && !isStrava && !isPlanned) ||
          (srcFilter.has('planned') && isPlanned);
        if (!matchesSource) return false;
      }
      if (sportFilter) {
        if (sportFilter.startsWith('__cat__')) {
          const cat = sportFilter.slice(7) as ActivityCategory;
          if (mapSportTypeToCategory(r.activity.sportType) !== cat) {
            return false;
          }
        } else {
          if (r.activity.sportType !== sportFilter) {
            return false;
          }
        }
      }
      if (fromDate && r.activity.startDate && !isAfterOrEqual(r.activity.startDate, fromDate)) {
        return false;
      }
      if (toDate && r.activity.startDate && !isBeforeOrEqual(r.activity.startDate, toDate)) {
        return false;
      }
      if (search && !r.activity.name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });
  });

  protected readonly visibleRouteCount = computed(() => this.filteredRoutes().length);

  private readonly routeStats = computed(() => {
    const routes = this.filteredRoutes();
    let totalDistanceMeters = 0;
    let totalMovingSeconds = 0;
    let totalPoints = 0;
    let speedSum = 0;
    let speedCount = 0;
    for (const r of routes) {
      totalDistanceMeters += r.activity.distanceMeters ?? 0;
      totalMovingSeconds += r.activity.movingTimeSeconds ?? 0;
      totalPoints += r.coordinates.length;
      const speed = computeSpeed(
        r.activity.averageSpeedMetersPerSecond,
        r.activity.distanceMeters,
        r.activity.movingTimeSeconds,
      );
      if (speed !== undefined) {
        speedSum += speed;
        speedCount++;
      }
    }
    return { totalDistanceMeters, totalMovingSeconds, totalPoints, speedSum, speedCount };
  });

  protected readonly statDistance = computed(() => {
    const { totalDistanceMeters } = this.routeStats();
    if (totalDistanceMeters === 0) {
      return '0 km';
    }
    const d = totalDistanceMeters / 1000;
    return d >= 100 ? `${d.toFixed(0)} km` : `${d.toFixed(1)} km`;
  });

  protected readonly statMovingTime = computed(() => {
    const { totalMovingSeconds } = this.routeStats();
    return totalMovingSeconds === 0 ? '0h 0m' : formatDurationHours(totalMovingSeconds);
  });

  protected readonly statAvgSpeed = computed(() => {
    const { speedSum, speedCount } = this.routeStats();
    if (speedCount === 0) {
      return '—';
    }
    return `${((speedSum / speedCount) * 3.6).toFixed(1)} km/h`;
  });

  protected readonly visiblePointCount = computed(() => this.routeStats().totalPoints);

  protected readonly autoFilterTriggered = signal(false);

  protected readonly autoFilterHintBanner = computed<string | null>(() => {
    if (this.autoFilterHintDismissed()) {
      return null;
    }
    if (!this.autoFilterTriggered()) {
      return null;
    }
    return 'Filtered to "This year" for better performance. You can change the date range in the filter below.';
  });

  protected readonly performanceWarning = computed<string | null>(() => {
    if (this.perfWarningDismissed()) {
      return null;
    }
    const routes = this.visibleRouteCount();
    const points = this.visiblePointCount();
    if (routes >= ROUTES_WARN_THRESHOLD) {
      return `Showing ${routes.toLocaleString()} routes with ${points.toLocaleString()} GPS points. The map may be slow. Try filtering by activity type or date range.`;
    }
    if (points >= POINTS_WARN_THRESHOLD) {
      return `Showing ${points.toLocaleString()} GPS points across ${routes.toLocaleString()} routes. The map may be slow. Try filtering by activity type or date range.`;
    }
    return null;
  });

  protected readonly selectedActivityId = computed(
    () => this.activityIdParam() ?? this.selectedMapRoute()?.activityId ?? null,
  );
  protected readonly hasBasemapError = computed(
    () => this.basemapErrorParam() || this.mapBasemapError(),
  );

  /** Saved places as exposed to templates/markers (newest-first, from the service signal). */
  protected readonly savedPlaces = computed(() => this.savedPlacesService.places());
  protected readonly selectedRouteGeometry = signal<
    import('../storage/storage.models').RouteGeometryRecord | null
  >(null);

  protected readonly detailPanelRoute = computed<
    | (import('../storage/storage.models').ActivityRouteRecord & {
        coordinates: [number, number][];
        elevations?: number[];
        cumulativeDistances?: number[];
      })
    | null
  >(() => {
    const geom = this.selectedRouteGeometry();
    const route = this.selectedRoute()?.route;
    if (!geom || !route) {
      return null;
    }
    return {
      activityId: route.activityId,
      providerActivityId: route.providerActivityId,
      simplifiedCoordinates: route.simplifiedCoordinates,
      simplifiedPointCount: route.simplifiedPointCount,
      pointCount: route.pointCount,
      bounds: route.bounds,
      syncedAt: route.syncedAt,
      updatedAt: route.updatedAt,
      coordinates: geom.coordinates,
      elevations: geom.elevations,
      cumulativeDistances: geom.cumulativeDistances,
    };
  });

  protected readonly selectedRoute = computed<MapRouteFeature | null>(() => {
    const activityId = this.selectedActivityId();
    if (activityId) {
      return this.allRoutes().find((r) => r.activityId === activityId) ?? null;
    }
    return this.selectedMapRoute();
  });

  protected readonly mapSourceFilter = signal<Set<'strava' | 'imported' | 'planned'>>(new Set());

  protected onSourceFilterChange(filter: Set<'strava' | 'imported' | 'planned'>): void {
    this.mapSourceFilter.set(filter);
    this.scheduleEmphasisUpdate();
    this.tryRenderRoutes('source-filter');
  }

  protected onSportTypeChange(value: string): void {
    this.filtersService.setSportTypeFilter(value);
    this.filterMenuOpen.set(false);
  }

  protected onCategoryFilterChange(category: ActivityCategory): void {
    this.filtersService.setSportTypeFilter('__cat__' + category);
    this.filterMenuOpen.set(false);
  }

  protected toggleFilterMenu(): void {
    this.filterMenuOpen.update((v) => !v);
  }

  protected closeFilterMenu(): void {
    this.filterMenuOpen.set(false);
  }

  protected readonly noRouteActivity = computed(() => {
    const activityId = this.selectedActivityId();
    if (!activityId) {
      return false;
    }
    if (!this.dataLoaded()) return false;
    return (
      this.allRoutes().length > 0 && !this.allRoutes().some((r) => r.activityId === activityId)
    );
  });

  protected readonly noRouteActivityName = computed(() => {
    return this.selectedActivityId() ?? 'Unknown';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.retryDestroyed.set(true));
    this.loadRoutes().then(() => this.restorePanelState());
    void this.savedPlacesService.load();
    globalThis.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target?.closest('.toolbar-select') && !target?.closest('app-date-range-picker')) {
        this.filterMenuOpen.set(false);
        this.datePresetOpen.set(false);
      }
    });
    this.dataRefresh.refresh$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async () => {
      this.routesLoading.set(true);
      await this.loadRoutes();
      this.tryRenderRoutes('refresh');
      this.scheduleEmphasisUpdate();
    });
    effect(() => {
      this.dataLoaded();
      this.mapReady();
      this.leftPanelView();
      const filtered = this.filteredRoutes();
      if (this.dataLoaded() && this.mapReady()) {
        this.tryRenderRoutes('effect');
      }
      if (this.allRoutes().length > 0 && filtered.length === 0) {
        this.closeFilterMenu();
        this.datePresetOpen.set(false);
      }
    });
    effect(() => {
      this.filtersService.nameSearch();
      this.filtersService.sportTypeFilter();
      this.filtersService.dateFrom();
      this.filtersService.dateTo();
      this.dataLoaded();
      this.scheduleEmphasisUpdate();
    });
    effect(() => {
      const route = this.selectedRoute();
      if (route && !this.selectedRouteGeometry()) {
        this.fetchFullGeometryForRoute(route);
      }
    });
    // Capture placeId/from from URL into pending signals. Once consumed by the fly-to effect
    // below, pendingPlaceId is set to null so the URL params are never re-processed on subsequent
    // signal changes. We intentionally do NOT navigate to clear the URL params here — doing so
    // from within a constructor effect can race with the component's async initialization and
    // cause the component to be destroyed/re-created before the fly-to completes.
    effect(() => {
      const placeId = this.placeIdParam();
      const from = this.fromParam();
      if (placeId) {
        this.placeNavigationActive.set(true);
        this.pendingPlaceId.set(placeId);
        this.pendingPlaceSource.set(from);
      }
    });
    // Drive the fly-to logic from pending signals so it works regardless of URL state
    effect(() => {
      const placeId = this.pendingPlaceId();
      const from = this.pendingPlaceSource();
      const places = this.savedPlacesService.places();
      const ready = this.mapReady();
      if (!placeId) return;
      const found = places.find((p) => p.id === placeId);
      if (found && ready) {
        this.selectedPlaceId.set(found.id);
        this.leftPanelView.set(from === 'all' ? 'all' : 'places');
        // focusSavedPlace handles map-not-ready internally with a retry loop.
        this.mapComponent?.focusSavedPlace(found);
        // Clear pending so we don't re-fly on every signal change
        this.pendingPlaceId.set(null);
        this.pendingPlaceSource.set(null);
      }
    });
  }

  ngAfterViewInit(): void {
    this.mapReady.set(true);
    this.tryRenderRoutes('ngAfterViewInit');
    this.scheduleRenderRetry();
  }

  private async loadRoutes(): Promise<void> {
    try {
      const [activities, activityRoutes] = await Promise.all([
        this.repositories.activities.list(),
        this.repositories.activityRoutes.list(),
      ]);

      const activityRecordsById = new Map(activities.map((a) => [a.id, a]));

      const routes: MapRouteFeature[] = [];

      for (const routeRecord of activityRoutes) {
        const activity = activityRecordsById.get(routeRecord.activityId);
        if (!activity || activity.routeSyncStatus !== 'route_synced') {
          continue;
        }
        const coords =
          (routeRecord as any).simplifiedCoordinates ?? (routeRecord as any).coordinates ?? [];
        routes.push({
          activityId: routeRecord.activityId,
          activity,
          route: routeRecord,
          coordinates: coords,
          name: activity.name,
          fullGeometryId: routeRecord.activityId,
        });
      }

      this.allRoutes.set(routes);
      this.dataLoaded.set(true);

      const totalPoints = routes.reduce((sum, r) => sum + (r.route.pointCount ?? 0), 0);
      if (
        totalPoints > POINTS_WARN_THRESHOLD / 2 &&
        this.filtersService.datePreset() === 'all' &&
        !this.filtersService.userInteracted
      ) {
        this.applyDatePreset('year');
        this.autoFilterHighlight.set(true);
        setTimeout(() => this.autoFilterHighlight.set(false), 6_500);
        const settings = await this.repositories.settings.getOrCreateDefault();
        const count = settings.autoFilterHintCount ?? 0;
        if (count < 4) {
          this.autoFilterTriggered.set(true);
        }
      }
    } catch {
    } finally {
      this.tryRenderRoutes('finally');
      this.scheduleRenderRetry();
      this.routesLoading.set(false);
    }
  }

  private tryRenderRoutes(source?: string): void {
    const src = source ?? 'unknown';
    logger.trace(
      `tryRenderRoutes from ${src}: dataLoaded=${this.dataLoaded()}, mapReady=${this.mapReady()}, mapComp=${!!this.mapComponent}, filteredRoutes=${this.filteredRoutes().length}`,
    );
    if (!this.dataLoaded() || !this.mapReady()) {
      logger.trace(`tryRenderRoutes from ${src}: SKIP (not ready)`);
      return;
    }
    const mapComp = this.mapComponent;
    if (!mapComp) {
      logger.trace(`tryRenderRoutes from ${src}: SKIP (no mapComp)`);
      return;
    }
    // When the Places tab is active, clear route data from the map so only saved-place markers
    // are visible. Routes re-render automatically when switching to Activities or All.
    if (this.leftPanelView() === 'places') {
      this.routeRendererService.clearRoutes();
      return;
    }
    const routes = this.filteredRoutes();
    const selectId = this.selectedActivityId();
    mapComp.renderRouteFeatures(routes, selectId ?? undefined);
  }

  protected onRoutesRendered(): void {
    setTimeout(() => this.routesRendered.set(true), 500);
  }

  protected onMapIdle(): void {
    this.filterLoading.set(false);
  }

  private scheduleRenderRetry(): void {
    if (this.dataLoaded() && this.mapReady()) {
      return;
    }
    if (this.renderRetryCount >= this.MAX_RENDER_RETRIES) {
      return;
    }
    this.renderRetryCount++;
    setTimeout(() => {
      if (this.retryDestroyed()) {
        return;
      }
      if (this.dataLoaded() && this.mapReady()) {
        logger.trace('scheduleRenderRetry: condition met, calling tryRenderRoutes');
        this.tryRenderRoutes('retry');
      } else {
        logger.trace(
          `scheduleRenderRetry: retry ${this.renderRetryCount}/${this.MAX_RENDER_RETRIES}, still waiting. dataLoaded=${this.dataLoaded()}, mapReady=${this.mapReady()}`,
        );
        this.scheduleRenderRetry();
      }
    }, 100);
  }

  protected formatSportType = formatSportType;
  protected formatCategory = formatCategory;
  protected mapSportTypeToCategory = mapSportTypeToCategory;

  protected showBasemapError(): void {
    this.mapBasemapError.set(true);
  }

  protected retryBasemapLoad(): void {
    this.mapBasemapError.set(false);
  }

  protected async dismissAutoFilterHint(): Promise<void> {
    this.autoFilterHintDismissed.set(true);
    const settings = await this.repositories.settings.getOrCreateDefault();
    await this.repositories.settings.put({
      ...settings,
      autoFilterHintCount: (settings.autoFilterHintCount ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });
  }

  protected dismissPerformanceWarning(): void {
    this.perfWarningDismissed.set(true);
  }

  protected selectRoute(route: MapRouteFeature): void {
    this.selectedRouteGeometry.set(null);
    this.selectedMapRoute.set(route);
    if (this.selectedActivityId()) {
      this.router.navigate(['/map'], { queryParams: {}, replaceUrl: true });
    }
    this.fetchFullGeometryForRoute(route);
    this.scheduleEmphasisUpdate();
  }

  private fetchFullGeometryForRoute(route: MapRouteFeature): void {
    if (route.fullGeometryId) {
      this.repositories.routeGeometry.get(route.fullGeometryId).then((geom) => {
        if (geom) {
          this.selectedRouteGeometry.set(geom);
        } else {
          const oldCoords = (route.route as any).coordinates;
          const oldElevations = (route.route as any).elevations;
          const oldDistances = (route.route as any).cumulativeDistances;
          if (oldCoords && oldCoords.length > 0) {
            this.selectedRouteGeometry.set({
              activityId: route.fullGeometryId!,
              providerActivityId: '',
              coordinates: oldCoords,
              elevations: oldElevations,
              cumulativeDistances: oldDistances,
              syncedAt: '',
              updatedAt: '',
            });
          } else {
            this.selectedRouteGeometry.set(null);
          }
        }
      });
    } else {
      this.selectedRouteGeometry.set(null);
    }
  }

  protected clearSelectedRoute(): void {
    this.selectedMapRoute.set(null);
    this.selectedRouteGeometry.set(null);
    this.routeRendererService.deselectRoute();
    this.routeRendererService.clearHoverPoint();
    this.router.navigate(['/map'], { queryParams: {}, replaceUrl: true });
    this.scheduleEmphasisUpdate();
  }

  protected onElevationHover(position: { lng: number; lat: number } | null): void {
    if (position) {
      this.routeRendererService.showHoverPoint(position.lng, position.lat);
    } else {
      this.routeRendererService.clearHoverPoint();
    }
  }

  protected clearSelectedActivity(): void {
    this.selectedMapRoute.set(null);
    this.selectedRouteGeometry.set(null);
    this.routeRendererService.deselectRoute();
    this.router.navigate(['/map']);
    this.scheduleEmphasisUpdate();
  }

  protected clearAllFilters(): void {
    this.filtersService.clearAll();
    this.activityPanel?.resetSourceFilter();
    this.scheduleEmphasisUpdate();
    this.tryRenderRoutes('clear-filters');
    const totalPoints = this.allRoutes().reduce((sum, r) => sum + (r.route.pointCount ?? 0), 0);
    if (totalPoints > POINTS_WARN_THRESHOLD / 2) {
      this.applyDatePreset('year');
    }
  }

  protected syncActivities(): void {
    this.dataRefresh.startSync('Syncing...');
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected async downloadDetailGpx(route: MapRouteFeature): Promise<void> {
    const result = await this.gpxExportService.exportActivity(route.activity);
    if (!result.success) {
      this.toastService.show(result.reason);
    }
  }

  protected navigateToMapDetail(route: MapRouteFeature): void {
    this.detailPanelOpen.set(true);
  }

  protected closeDetailPanel(): void {
    this.detailPanelOpen.set(false);
    this.detailPanelExpanded.set(false);
  }

  protected async onRenameActivity(route: MapRouteFeature): Promise<void> {
    const a = route.activity;
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

  protected openOnStravaFromCard(route: MapRouteFeature): void {
    this.openOnStrava(new MouseEvent('click'), route.activity);
  }

  protected navigateToActivity(activity: import('../storage/storage.models').ActivityRecord): void {
    this.router.navigate(['/logbook'], { queryParams: { focusActivityId: activity.id } });
  }

  protected openOnStrava(
    event: MouseEvent,
    activity: import('../storage/storage.models').ActivityRecord,
  ): void {
    event.stopPropagation();
    const url = `https://www.strava.com/activities/${activity.providerActivityId}`;
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  protected onPanelSelectRoute(route: MapRouteFeature): void {
    this.hoveredActivityId.set(null);
    this.selectedRouteGeometry.set(null);
    this.selectedMapRoute.set(route);
    this.fetchFullGeometryForRoute(route);
    this.routeRendererService.selectRoute(route.activityId);
    this.routeRendererService.fitToRoute(route.coordinates, route.route.bounds);
    if (this.selectedActivityId()) {
      this.router.navigate(['/map'], { queryParams: {}, replaceUrl: true });
    }
    this.scheduleEmphasisUpdate();
  }

  protected onPanelHoverRoute(route: MapRouteFeature | null): void {
    this.hoveredActivityId.set(route?.activityId ?? null);
  }

  /** Centers the map on a saved place and opens its marker popup. */
  protected onSelectPlace(place: import('../storage/storage.models').SavedPlaceRecord): void {
    this.selectedPlaceId.set(place.id);
    this.mapComponent?.focusSavedPlace(place);
  }

  /**
   * Removes a saved place after a destructive confirmation. Triggered from the places-panel
   * overflow menu and from a saved-marker popup. Preserves the current map position.
   */
  protected async onRemovePlace(
    place: import('../storage/storage.models').SavedPlaceRecord,
  ): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Remove saved place?',
      message: `This will remove "${place.name}" from your saved places.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await this.savedPlacesService.remove(place.id);
    if (this.selectedPlaceId() === place.id) {
      this.selectedPlaceId.set(null);
    }
  }

  /** Persists the new coordinates when a saved-place marker is dragged to a new position. */
  protected async onMarkerRepositioned(event: {
    id: string;
    latitude: number;
    longitude: number;
  }): Promise<void> {
    await this.savedPlacesService.reposition(event.id, event.latitude, event.longitude);
  }

  /** Stores the selected search result and surfaces whether it is already saved. */
  protected async onSearchResultSelected(payload: SearchSelectedPayload): Promise<void> {
    this.selectedSearchResult.set(payload.result);
    const alreadySaved = await this.savedPlacesService.isAlreadySaved(payload.result);
    this.mapComponent?.selectedResultSaved.set(alreadySaved);
  }

  /**
   * Opens the save-place name dialog for the selected search result and, on confirmation,
   * persists it. A duplicate (already-saved) result is surfaced as saved instead of re-created.
   */
  protected async onSavePlaceRequested(result: GeocodeResult): Promise<void> {
    const alreadySaved = await this.savedPlacesService.findDuplicate({
      providerId: result.providerId,
      latitude: result.center[1],
      longitude: result.center[0],
    });
    if (alreadySaved) {
      this.mapComponent?.selectedResultSaved.set(true);
      this.selectedPlaceId.set(alreadySaved.id);
      this.mapComponent?.focusSavedPlace(alreadySaved);
      return;
    }

    const data: SavePlaceDialogData = {
      mode: 'create',
      suggestedName: result.providerName ?? result.label,
      secondaryLabel: result.secondaryLabel,
    };
    const ref = this.dialog.open(SavePlaceDialog, { data, disableClose: true });
    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) {
      return;
    }

    try {
      // GeocodeResult.center is [lng, lat].
      const saved = await this.savedPlacesService.save({
        name: confirmed.name,
        notes: confirmed.notes,
        latitude: result.center[1],
        longitude: result.center[0],
        providerName: result.providerName,
        secondaryLabel: result.secondaryLabel,
        providerId: result.providerId,
      });
      if (saved) {
        this.selectedPlaceId.set(saved.id);
        this.mapComponent?.selectedResultSaved.set(true);
      } else {
        // A concurrent save produced a duplicate — surface the existing one.
        this.mapComponent?.selectedResultSaved.set(true);
      }
    } catch {
      this.toastService.show('Could not save place. Please try again.');
    }
  }

  /**
   * Saves a place from the right-click context menu flow. Reverse-geocodes the clicked
   * coordinates for a default name, shows the save dialog, and persists on confirmation.
   */
  protected async onSavePlaceFromContextMenu(event: {
    longitude: number;
    latitude: number;
  }): Promise<void> {
    const { longitude, latitude } = event;
    let suggestedName = `Place at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    let secondaryLabel: string | undefined;

    // Attempt reverse geocoding for a better default name — non-blocking.
    try {
      const reverseResult = await this.geocodingService.reverse(latitude, longitude);
      if (reverseResult) {
        suggestedName = reverseResult.providerName ?? reverseResult.label;
        secondaryLabel = reverseResult.secondaryLabel;
      }
    } catch {
      // Fall through with the coordinate-based name.
    }

    const data: SavePlaceDialogData = {
      mode: 'create',
      suggestedName,
      secondaryLabel,
    };
    const ref = this.dialog.open(SavePlaceDialog, { data, disableClose: true });
    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) {
      this.mapComponent?.clearTempMarker();
      return;
    }

    try {
      const saved = await this.savedPlacesService.save({
        name: confirmed.name,
        notes: confirmed.notes,
        latitude,
        longitude,
        source: 'map-context-menu',
      });
      if (saved) {
        this.mapComponent?.clearTempMarker();
        this.selectedPlaceId.set(saved.id);
        this.toastService.show('Place saved');
      } else {
        // Near-duplicate — still allow saving in MVP (§10).
        const savedAnyways = await this.savedPlacesService.save({
          name: confirmed.name,
          notes: confirmed.notes,
          latitude,
          longitude,
          source: 'map-context-menu',
        });
        if (savedAnyways) {
          this.mapComponent?.clearTempMarker();
          this.selectedPlaceId.set(savedAnyways.id);
          this.toastService.show('Place saved');
        }
      }
    } catch {
      this.toastService.show('The place could not be saved. Try again.');
      // Keep the dialog and temp marker open so the user can retry or cancel.
    }
  }

  /**
   * Opens the edit dialog for an existing saved place and persists the new name/notes. The map
   * marker popup/secondary label update automatically via the shared `savedPlaces` signal.
   */
  protected async onEditPlace(
    place: import('../storage/storage.models').SavedPlaceRecord,
  ): Promise<void> {
    const data: SavePlaceDialogData = {
      mode: 'edit',
      suggestedName: place.name,
      suggestedNotes: place.notes,
      secondaryLabel: place.secondaryLabel,
    };
    const ref = this.dialog.open(SavePlaceDialog, { data, disableClose: true });
    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) {
      return;
    }
    try {
      await this.savedPlacesService.update(place.id, {
        name: confirmed.name,
        notes: confirmed.notes,
      });
    } catch {
      this.toastService.show('Could not update place. Please try again.');
    }
  }

  protected onPanelExpandedChange(expanded: boolean): void {
    this.panelExpanded.set(expanded);
    this.persistPanelState(expanded);
  }

  protected async onDownloadPanelGpx(routes: MapRouteFeature[]): Promise<void> {
    const activities = routes.map((r) => r.activity);
    if (activities.length === 0) {
      return;
    }
    const count = await this.gpxExportService.buildZip(
      new (await import('jszip')).default(),
      activities,
    );
    if (count.exported === 0) {
      this.toastService.show('No GPS routes available for the displayed activities.');
      return;
    }
    if (count.exported > 10) {
      const confirmed = await this.confirmService.confirm({
        title: `Download ${count.exported} GPX ${count.exported === 1 ? 'file' : 'files'} as zip?`,
        message: `${count.skipped} ${count.skipped === 1 ? 'activity' : 'activities'} skipped (no route).`,
        confirmLabel: 'Download',
        danger: false,
      });
      if (!confirmed) {
        return;
      }
    }
    await this.gpxExportService.exportActivitiesAsZip(activities);
  }

  private async restorePanelState(): Promise<void> {
    if (this.panelLoaded) {
      return;
    }
    this.panelLoaded = true;
    const settings = await this.repositories.settings.getOrCreateDefault();
    this.panelExpanded.set(settings.mapExplorerPanelExpanded ?? true);
    this.panelReady.set(true);
  }

  private async persistPanelState(expanded: boolean): Promise<void> {
    const settings = await this.repositories.settings.getOrCreateDefault();
    await this.repositories.settings.put({
      ...settings,
      mapExplorerPanelExpanded: expanded,
      updatedAt: new Date().toISOString(),
    });
  }

  protected onPanelVisibleOnMapChange(enabled: boolean): void {
    this.panelVisibleOnMap.set(enabled);
  }

  protected onViewportChanged(bounds: [[number, number], [number, number]]): void {
    this.panelViewportBounds.set(bounds);
  }

  private scheduleEmphasisUpdate(): void {
    if (this.emphasisTimeout) {
      clearTimeout(this.emphasisTimeout);
    }
    this.emphasisTimeout = setTimeout(() => this.updateEmphasis(), 50);
  }

  private updateEmphasis(): void {
    if (!this.dataLoaded()) {
      return;
    }
    const filtered = this.filteredRoutes();
    const selectedId = this.selectedRoute()?.activityId ?? null;

    if (filtered.length === this.allRoutes().length && !selectedId) {
      this.routeRendererService.clearEmphasis();
      return;
    }

    this.filterLoading.set(filtered.length > 0);
    const matchingIds = new Set(filtered.map((r) => r.activityId));
    this.routeRendererService.setEmphasis(matchingIds, selectedId);
  }
}

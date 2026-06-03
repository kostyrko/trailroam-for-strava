import {
  AfterViewInit,
  Component,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { MapLibreMapComponent } from './maplibre-map.component';
import { type MapRouteFeature } from './mock-routes';
import { FiltersService, ACTIVITY_CATEGORIES, CATEGORY_COLORS, isAfterOrEqual, isBeforeOrEqual } from '../shared/filters.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { RouteRendererService } from './route-renderer.service';

function formatDistance(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatElevation(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${meters.toFixed(0)} m`;
}

function computeSpeed(metersPerSecond: number | undefined, distanceMeters: number | undefined, movingTimeSeconds: number | undefined): number | undefined {
  if (metersPerSecond !== undefined && metersPerSecond !== 0) { return metersPerSecond; }
  if (distanceMeters && movingTimeSeconds) { return distanceMeters / movingTimeSeconds; }
  return undefined;
}

function formatSpeed(metersPerSecond: number | undefined): string {
  if (metersPerSecond === undefined || metersPerSecond === 0) { return '—'; }
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

function formatHeartrate(bpm: number | undefined): string {
  if (bpm === undefined || bpm === 0) { return '—'; }
  return `${bpm.toFixed(0)} bpm`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === 0) { return '—'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) { return `${h}h ${m}m`; }
  return `${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateInput(iso: string | null): string {
  if (!iso) { return ''; }
  const d = new Date(iso);
  if (isNaN(d.getTime())) { return ''; }
  return d.toISOString().slice(0, 10);
}

const ROUTES_WARN_THRESHOLD = 1_000;
const POINTS_WARN_THRESHOLD = 1_000_000;

@Component({
  selector: 'app-map-page',
  imports: [MapLibreMapComponent],
  template: `
      @if (performanceWarning(); as warning) {
        <article class="notice-bar warning-state" role="alert">
          <p class="notice-bar-kicker">Performance notice</p>
          <p>{{ warning }}</p>
          <button class="notice-bar-dismiss" type="button" (click)="dismissPerformanceWarning()">Dismiss</button>
        </article>
      }

      @if (hasBasemapError()) {
        <article class="notice-bar warning-state" aria-labelledby="basemap-error-title" role="alert">
          <p class="notice-bar-kicker">Basemap unavailable</p>
          <h2 id="basemap-error-title">The map background could not load.</h2>
          <p>
            Your local activities and routes are unaffected. Check your connection and try loading the map again.
          </p>
          <button class="primary-action" type="button" (click)="retryBasemapLoad()">Retry map load</button>
        </article>
      }

    <section class="route-page" aria-labelledby="map-title">
      <h1 id="map-title">Map</h1>

      <div class="map-filters">
        <div class="filter-group">
          <span class="filter-label">Activity type</span>
          <div class="custom-select" tabindex="0" (click)="toggleFilterMenu()" (keydown.enter)="toggleFilterMenu()" (blur)="closeFilterMenu()">
            <span class="custom-select-trigger">
              @if (filtersService.categoryFilter(); as sel) {
                <span class="cat-dot" [style.background]="CATEGORY_COLORS[sel]"></span>{{ sel }}
              } @else {
                All types
              }
              <span class="select-arrow">▾</span>
            </span>
            @if (filterMenuOpen()) {
              <ul class="custom-select-options" (mousedown)="$event.preventDefault()">
                <li role="option" (click)="onCategoryChange('')" [class.active]="!filtersService.categoryFilter()">All types</li>
                @for (cat of ACTIVITY_CATEGORIES; track cat) {
                  <li role="option" (click)="onCategoryChange(cat)" [class.active]="filtersService.categoryFilter() === cat">
                    <span class="cat-dot" [style.background]="CATEGORY_COLORS[cat]"></span>{{ cat }}
                  </li>
                }
              </ul>
            }
          </div>
          @if (filtersService.categoryFilter()) {
            <button class="filter-clear" type="button" (click)="onCategoryChange('')">Clear</button>
          }
        </div>
        <label class="filter-group">
          <span class="filter-label">From</span>
          <input
            class="filter-input"
            type="date"
            [value]="formatDateInput(filtersService.dateFrom())"
            (change)="onDateFromChange($any($event.target).value)"
          />
          @if (filtersService.dateFrom()) {
            <button class="filter-clear" type="button" (click)="onDateFromChange('')">Clear</button>
          }
        </label>
        <label class="filter-group">
          <span class="filter-label">To</span>
          <input
            class="filter-input"
            type="date"
            [value]="formatDateInput(filtersService.dateTo())"
            (change)="onDateToChange($any($event.target).value)"
          />
          @if (filtersService.dateTo()) {
            <button class="filter-clear" type="button" (click)="onDateToChange('')">Clear</button>
          }
        </label>
      </div>

      @if (!hasBasemapError()) {
        @if (!noRouteActivity() && !selectedRoute() && !selectedActivityId() && allRoutes().length === 0) {
          <article class="empty-state map-empty-state" aria-labelledby="map-empty-title">
            <p class="empty-state-kicker">No routes yet</p>
            <h2 id="map-empty-title">Synced GPS routes will appear here.</h2>
            <p>
              Start a sync to import Strava activities and show available route lines on this map.
            </p>
            <p class="privacy-note">Your data stays private — everything is stored locally in your browser.</p>
            <button class="primary-action" type="button" (click)="syncActivities()">Sync activities</button>
          </article>
        }
        <app-maplibre-map
          (basemapLoadFailed)="showBasemapError()"
          (routeSelected)="selectRoute($event)"
          (fullscreenChanged)="mapFullscreen.set($event)"
        />
        @if (selectedRoute(); as route) {
          <article class="route-detail" [class.route-detail-overlay]="mapFullscreen()" aria-label="Selected route details">
            <div class="route-detail-header">
              <h2 class="route-detail-title">{{ route.name }}</h2>
              <button class="detail-close" type="button" (click)="clearSelectedRoute()" aria-label="Clear selected route">
                Close
              </button>
            </div>
            <dl class="route-detail-stats">
              <div class="stat">
                <dt class="stat-label">Date</dt>
                <dd class="stat-value">{{ formatDate(route.activity.startDate) }}</dd>
              </div>
              <div class="stat">
                <dt class="stat-label">Type</dt>
                <dd class="stat-value category-tag">{{ route.activity.activityCategory }}</dd>
              </div>
              <div class="stat">
                <dt class="stat-label">Distance</dt>
                <dd class="stat-value">{{ formatDistance(route.activity.distanceMeters) }}</dd>
              </div>
              <div class="stat">
                <dt class="stat-label">Speed</dt>
                <dd class="stat-value">{{ formatSpeed(computeSpeed(route.activity.averageSpeedMetersPerSecond, route.activity.distanceMeters, route.activity.movingTimeSeconds)) }}</dd>
              </div>
              <div class="stat">
                <dt class="stat-label">Moving time</dt>
                <dd class="stat-value">{{ formatDuration(route.activity.movingTimeSeconds) }}</dd>
              </div>
              <div class="stat">
                <dt class="stat-label">Strava</dt>
                <dd class="stat-value">
                  <a class="strava-link" (click)="openOnStrava($event, route.activity)" href="javascript:void(0)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Open in Strava
                  </a>
                </dd>
              </div>
            </dl>
          </article>
        }
      }

      @if (noRouteActivity()) {
        <article class="empty-state" aria-labelledby="no-route-title">
          <p class="empty-state-kicker">No route available</p>
          <h2 id="no-route-title">{{ noRouteActivityName() }} has no GPS route data.</h2>
          <p>
            This activity was recorded without GPS or the route data is not available.
          </p>
          <button class="secondary-action" type="button" (click)="clearSelectedActivity()">
            Browse all activities
          </button>
        </article>
      }

    </section>
  `,
  styles: [`
    .route-detail {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      box-sizing: border-box;
      margin-bottom: 12px;
      margin-top: 12px;
      padding: 12px 16px;
      width: 100%;
    }

    .route-detail-overlay {
      border: 1px solid #cbd8d0;
      bottom: 52px;
      box-shadow: 0 4px 20px rgb(20 33 27 / 25%);
      left: 24px;
      margin: 0;
      max-width: 380px;
      position: fixed;
      z-index: 1001;
    }


    .route-detail-header {
      align-items: center;
      display: flex;
      gap: 10px;
      min-width: 0;
      width: 100%;
    }

    .route-detail-title {
      flex: 1;
      font-size: 0.9375rem;
      font-weight: 700;
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail-close {
      background: transparent;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #314b3f;
      cursor: pointer;
      flex-shrink: 0;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      min-height: 28px;
      padding: 3px 9px;
      white-space: nowrap;
    }

    .detail-close:hover {
      background: #eef5f0;
    }

    .route-detail-stats {
      display: grid;
      gap: 6px 16px;
      grid-template-columns: 1fr 1fr;
      margin: 10px 0 0;
      width: 100%;
    }

    .stat {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      color: #63746a;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 0;
      text-transform: uppercase;
    }

    .stat-value {
      color: #14211b;
      font-size: 0.875rem;
      font-weight: 600;
      margin: 0;
      padding: 0;
    }

    .strava-link {
      align-items: center;
      color: #1f6f50;
      cursor: pointer;
      display: inline-flex;
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 4px;
      text-decoration: none;
    }

    .strava-link:hover {
      color: #185940;
      text-decoration: underline;
    }

    .route-detail .category-tag {
      display: inline;
      font-size: inherit;
      font-weight: inherit;
      padding: 0;
    }

    .category-tag {
      background: #eef5f0;
      border-radius: 4px;
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 7px;
      text-transform: capitalize;
    }

    .map-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .notice-bar {
      align-items: center;
      border-bottom: 1px solid #d2b96d;
      display: flex;
      gap: 18px;
      justify-content: space-between;
      padding: 12px 24px;
      width: 100%;
    }

    .notice-bar.warning-state {
      background: #fbf5e1;
      color: #7a621a;
    }

    .notice-bar-kicker {
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      margin: 0 0 2px;
      text-transform: uppercase;
    }

    .notice-bar p {
      margin: 0;
    }

    .notice-bar-dismiss {
      background: transparent;
      border: 1px solid #f0c674;
      border-radius: 6px;
      color: #7a621a;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      min-height: 32px;
      padding: 5px 11px;
      white-space: nowrap;
    }

    .notice-bar-dismiss:hover {
      background: #fdf3d1;
    }

    .filter-group {
      align-items: center;
      display: flex;
      gap: 8px;
      position: relative;
    }

    .filter-label {
      color: #4f6f5d;
      font-size: 0.8125rem;
      font-weight: 700;
    }

    .custom-select {
      cursor: pointer;
      font-size: 0.875rem;
      min-height: 36px;
      outline: none;
      position: relative;
      user-select: none;
    }

    .custom-select-trigger {
      align-items: center;
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #14211b;
      display: inline-flex;
      gap: 6px;
      min-height: 36px;
      padding: 6px 10px;
    }

    .select-arrow {
      color: #a0b4a6;
      font-size: 0.75rem;
      margin-left: 4px;
    }

    .custom-select-options {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgb(20 33 27 / 15%);
      left: 0;
      list-style: none;
      margin: 0;
      min-width: 100%;
      padding: 4px 0;
      position: absolute;
      top: 100%;
      z-index: 20;
    }

    .custom-select-options li {
      align-items: center;
      cursor: pointer;
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      white-space: nowrap;
    }

    .custom-select-options li:hover,
    .custom-select-options li.active {
      background: #eef5f0;
    }

    .cat-dot {
      border-radius: 50%;
      display: inline-block;
      height: 8px;
      width: 8px;
    }

    .filter-clear {
      background: transparent;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #314b3f;
      cursor: pointer;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      min-height: 32px;
      padding: 5px 11px;
    }

    .filter-clear:hover {
      background: #eef5f0;
    }

    .filter-input {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #14211b;
      font: inherit;
      font-size: 0.875rem;
      min-height: 36px;
      padding: 6px 10px;
    }

    .map-empty-state {
      margin-bottom: 12px;
      width: 100%;
      box-sizing: border-box;
    }
  `],
})
export class MapPage implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  protected readonly filtersService = inject(FiltersService);
  private readonly routeRendererService = inject(RouteRendererService);

  protected readonly ACTIVITY_CATEGORIES = ACTIVITY_CATEGORIES;
  protected readonly CATEGORY_COLORS = CATEGORY_COLORS;

  @ViewChild(MapLibreMapComponent)
  private readonly mapComponent!: MapLibreMapComponent;

  private readonly activityIdParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('activityId'))),
    { initialValue: null },
  );
  private readonly basemapErrorParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('basemapError') === 'true')),
    { initialValue: false },
  );
  private readonly mapBasemapError = signal(false);
  protected readonly allRoutes = signal<MapRouteFeature[]>([]);
  private readonly selectedMapRoute = signal<MapRouteFeature | null>(null);
  protected readonly filterMenuOpen = signal(false);
  protected readonly mapFullscreen = signal(false);
  private readonly perfWarningDismissed = signal(false);

  protected readonly filteredRoutes = computed(() => {
    const routes = this.allRoutes();
    const catFilter = this.filtersService.categoryFilter();
    const fromDate = this.filtersService.dateFrom();
    const toDate = this.filtersService.dateTo();
    return routes.filter((r) => {
      if (catFilter && r.activity.activityCategory !== catFilter) { return false; }
      if (fromDate && r.activity.startDate && !isAfterOrEqual(r.activity.startDate, fromDate)) { return false; }
      if (toDate && r.activity.startDate && !isBeforeOrEqual(r.activity.startDate, toDate)) { return false; }
      return true;
    });
  });

  protected readonly visibleRouteCount = computed(() => this.filteredRoutes().length);

  protected readonly visiblePointCount = computed(() =>
    this.filteredRoutes().reduce((sum, r) => sum + r.coordinates.length, 0),
  );

  protected readonly performanceWarning = computed<string | null>(() => {
    if (this.perfWarningDismissed()) { return null; }
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

  protected readonly selectedActivityId = computed(() => this.activityIdParam());
  protected readonly hasBasemapError = computed(() => this.basemapErrorParam() || this.mapBasemapError());

  protected readonly selectedRoute = computed<MapRouteFeature | null>(() => {
    const activityId = this.selectedActivityId();
    if (activityId) {
      return this.allRoutes().find((r) => r.activityId === activityId) ?? null;
    }
    return this.selectedMapRoute();
  });

  protected onCategoryChange(value: string): void {
    this.filtersService.categoryFilter.set(value === '' ? null : (value as any));
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
    return !this.allRoutes().some((r) => r.activityId === activityId);
  });

  protected readonly noRouteActivityName = computed(() => {
    return this.selectedActivityId() ?? 'Unknown';
  });

  constructor() {
    this.loadRoutes();
    effect(() => {
      this.filteredRoutes();
      this.renderRoutesOnMap();
    });
  }

  ngAfterViewInit(): void {
    this.renderRoutesOnMap();
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
        routes.push({
          activityId: routeRecord.activityId,
          activity,
          route: routeRecord,
          coordinates: routeRecord.coordinates,
          name: activity.name,
        });
      }

      this.allRoutes.set(routes);
      this.renderRoutesOnMap();
    } catch {
    }
  }

  private renderRoutesOnMap(): void {
    const routes = this.filteredRoutes();
    const mapComp = this.mapComponent;
    const selectId = this.selectedActivityId();
    if (!mapComp) {
      return;
    }

    mapComp.renderRouteFeatures(routes, selectId ?? undefined);

    if (selectId) {
      const selected = this.selectedRoute();
      if (selected) {
        mapComp.flyToBounds(selected.coordinates);
      }
    }
  }

  protected computeSpeed = computeSpeed;
  protected formatDistance = formatDistance;
  protected formatSpeed = formatSpeed;
  protected formatDuration = formatDuration;
  protected formatDate = formatDate;
  protected formatDateInput = formatDateInput;
  protected onDateFromChange = this.filtersService.setDateFrom.bind(this.filtersService);
  protected onDateToChange = this.filtersService.setDateTo.bind(this.filtersService);

  protected showBasemapError(): void {
    this.mapBasemapError.set(true);
  }

  protected retryBasemapLoad(): void {
    this.mapBasemapError.set(false);
  }

  protected dismissPerformanceWarning(): void {
    this.perfWarningDismissed.set(true);
  }

  protected selectRoute(route: MapRouteFeature): void {
    this.selectedMapRoute.set(route);
    setTimeout(() => {
      document.querySelector('.route-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  }

  protected clearSelectedRoute(): void {
    this.selectedMapRoute.set(null);
    this.routeRendererService.deselectRoute();
    if (this.selectedActivityId()) {
      this.router.navigate(['/map']);
    }
  }

  protected clearSelectedActivity(): void {
    this.selectedMapRoute.set(null);
    this.routeRendererService.deselectRoute();
    this.router.navigate(['/map']);
  }

  protected syncActivities(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected openOnStrava(event: MouseEvent, activity: import('../storage/storage.models').ActivityRecord): void {
    event.stopPropagation();
    const url = `https://www.strava.com/activities/${activity.providerActivityId}`;
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }
}

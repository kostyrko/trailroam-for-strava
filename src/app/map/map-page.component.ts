import {
  AfterViewInit,
  Component,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { MapLibreMapComponent } from './maplibre-map.component';
import { type MapRouteFeature } from './mock-routes';
import { FiltersService, ACTIVITY_CATEGORIES, isAfterOrEqual, isBeforeOrEqual } from '../shared/filters.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';

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
    <section class="route-page" aria-labelledby="map-title">
      <p class="eyebrow">Map</p>
      <h1 id="map-title">Map</h1>

      <div class="map-filters">
        <label class="filter-group">
          <span class="filter-label">Activity type</span>
          <select
            class="filter-select"
            [value]="filtersService.categoryFilter() ?? ''"
            (change)="onCategoryChange($any($event.target).value)"
          >
            <option value="">All types</option>
            @for (cat of ACTIVITY_CATEGORIES; track cat) {
              <option [value]="cat">{{ cat }}</option>
            }
          </select>
          @if (filtersService.categoryFilter()) {
            <button class="filter-clear" type="button" (click)="onCategoryChange('')">Clear</button>
          }
        </label>
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

      @if (performanceWarning(); as warning) {
        <article class="empty-state warning-state" role="alert">
          <p class="empty-state-kicker">Performance notice</p>
          <p>{{ warning }}</p>
        </article>
      }

      @if (hasBasemapError()) {
        <article class="empty-state warning-state" aria-labelledby="basemap-error-title" role="alert">
          <p class="empty-state-kicker">Basemap unavailable</p>
          <h2 id="basemap-error-title">The map background could not load.</h2>
          <p>
            Your local activities and routes are unaffected. Check your connection and try loading the map again.
          </p>
          <button class="primary-action" type="button" (click)="retryBasemapLoad()">Retry map load</button>
        </article>
      }
      @if (!hasBasemapError()) {
        <app-maplibre-map
          (basemapLoadFailed)="showBasemapError()"
          (routeSelected)="selectRoute($event)"
        />
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

      @if (selectedRoute(); as route) {
        <article class="route-detail" aria-label="Selected route details">
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
              <dt class="stat-label">GPS points</dt>
              <dd class="stat-value">{{ route.coordinates.length }}</dd>
            </div>
          </dl>
        </article>
      }

      @if (!hasBasemapError() && !noRouteActivity() && !selectedRoute() && !selectedActivityId()) {
        <article class="empty-state" aria-labelledby="map-empty-title">
          <p class="empty-state-kicker">No routes yet</p>
          <h2 id="map-empty-title">Synced GPS routes will appear here.</h2>
          <p>
            Start a sync to import Strava activities and show available route lines on this map.
          </p>
          <button class="primary-action" type="button">Sync new activities</button>
        </article>
      }
    </section>
  `,
  styles: [`
    .route-detail {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      margin-top: 24px;
      max-width: 480px;
      padding: 20px;
    }

    .route-detail-header {
      align-items: flex-start;
      display: flex;
      justify-content: space-between;
    }

    .route-detail-title {
      font-size: 1.25rem;
      margin: 0;
    }

    .detail-close {
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
      white-space: nowrap;
    }

    .detail-close:hover {
      background: #eef5f0;
    }

    .route-detail-stats {
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr 1fr;
      margin: 16px 0 0;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-label {
      color: #63746a;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .stat-value {
      color: #14211b;
      font-size: 0.9375rem;
      font-weight: 600;
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
      margin-top: 16px;
    }

    .filter-group {
      align-items: center;
      display: flex;
      gap: 8px;
    }

    .filter-label {
      color: #4f6f5d;
      font-size: 0.8125rem;
      font-weight: 700;
    }

    .filter-select {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #14211b;
      font: inherit;
      font-size: 0.875rem;
      min-height: 36px;
      padding: 6px 10px;
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
  `],
})
export class MapPage implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  protected readonly filtersService = inject(FiltersService);
  protected readonly ACTIVITY_CATEGORIES = ACTIVITY_CATEGORIES;

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
  private readonly allRoutes = signal<MapRouteFeature[]>([]);
  private readonly selectedMapRoute = signal<MapRouteFeature | null>(null);

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
    if (!mapComp || routes.length === 0) {
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

  protected selectRoute(route: MapRouteFeature): void {
    this.selectedMapRoute.set(route);
  }

  protected clearSelectedRoute(): void {
    this.selectedMapRoute.set(null);
    if (this.selectedActivityId()) {
      this.router.navigate(['/map']);
    }
  }

  protected clearSelectedActivity(): void {
    this.router.navigate(['/map']);
  }
}

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
import { FiltersService, ACTIVITY_CATEGORIES } from '../shared/filters.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';

function formatDistance(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  const km = meters / 1000;
  if (km >= 100) { return `${km.toFixed(0)} km`; }
  if (km >= 10) { return `${km.toFixed(1)} km`; }
  return `${km.toFixed(2)} km`;
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
      } @else if (noRouteActivity()) {
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
      } @else {
        <app-maplibre-map
          (basemapLoadFailed)="showBasemapError()"
          (routeSelected)="selectRoute($event)"
        />
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
    if (!catFilter) { return routes; }
    return routes.filter((r) => r.activity.activityCategory === catFilter);
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

    if (!mapComp || routes.length === 0) {
      return;
    }

    const selectId = this.selectedActivityId();
    mapComp.renderRouteFeatures(routes, selectId ?? undefined);
  }

  protected formatDistance = formatDistance;
  protected formatDuration = formatDuration;
  protected formatDate = formatDate;

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

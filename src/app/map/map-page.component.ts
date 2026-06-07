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
import { ElevationProfileComponent } from './elevation-profile.component';
import { type MapRouteFeature } from './mock-routes';
import { FiltersService, CATEGORY_COLORS, isAfterOrEqual, isBeforeOrEqual } from '../shared/filters.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { RouteRendererService } from './route-renderer.service';
import { type ActivityCategory } from '../storage/storage.models';
import { formatSportType, mapSportTypeToCategory } from '../strava/activity-category';
import { ToastService } from '../shared/toast.service';
import { GpxExportService } from '../shared/gpx-export.service';

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
  imports: [MapLibreMapComponent, ElevationProfileComponent],
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
              @if (sportTypeFilter(); as sel) {
                @if (sel.startsWith('__cat__')) {
                  {{ sel.slice(7) }}
                } @else {
                  {{ formatSportType(sel) }}
                }
              } @else {
                All types
              }
              <span class="select-arrow">▾</span>
            </span>
            @if (filterMenuOpen()) {
              <ul class="custom-select-options sport-type-filter" (mousedown)="$event.preventDefault()">
                <li role="option" (click)="onSportTypeChange('')" [class.active]="!sportTypeFilter()">All types</li>
                @for (group of sportTypeGroups(); track group.category) {
                  <li class="sport-type-group-header" role="option" (click)="onCategoryFilterChange(group.category)" [class.active]="sportTypeFilter() === '__cat__' + group.category">
                    <span class="cat-dot" [style.background]="CATEGORY_COLORS[group.category]"></span>{{ group.category }}
                  </li>
                  @for (st of group.sportTypes; track st) {
                    <li class="sport-type-option" role="option" (click)="onSportTypeChange(st)" [class.active]="sportTypeFilter() === st">
                      <span class="sport-type-label">{{ formatSportType(st) }}</span>
                    </li>
                  }
                }
              </ul>
            }
          </div>
          @if (sportTypeFilter()) {
            <button class="filter-clear" type="button" (click)="onSportTypeChange('')">Clear</button>
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
          [fullscreenOverride]="mapFullscreen()"
          (basemapLoadFailed)="showBasemapError()"
          (routeSelected)="selectRoute($event)"
          (fullscreenChanged)="mapFullscreen.set($event)"
        />
        @if (selectedRoute(); as route) {
          <article class="route-detail" [class.route-detail-overlay]="mapFullscreen()" [class.show-profile-hint]="showProfileHint()" aria-label="Selected route details">
            <div class="route-detail-header">
              <h2 class="route-detail-title">
                <a class="route-title-link" (click)="navigateToActivity(route.activity)" href="javascript:void(0)">
                  {{ route.name }}
                  <svg class="route-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              </h2>
              <div class="detail-menu-wrapper">
                <button class="detail-menu-trigger" type="button" (click)="toggleDetailMenu($event)" aria-haspopup="menu" [attr.aria-expanded]="detailMenuOpen()">⋮</button>
                @if (detailMenuOpen()) {
                  <ul class="detail-dropdown" role="menu" (click)="$event.stopPropagation()">
                    <li role="none">
                      <button class="detail-dropdown-item" role="menuitem" (click)="downloadDetailGpx($event, route)">
                        <svg class="detail-dropdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download GPX
                      </button>
                    </li>
                    @if (!mapFullscreen()) {
                      <li role="none">
                        <button class="detail-dropdown-item" role="menuitem" (click)="showProfile($event, route)">
                          <svg class="detail-dropdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                          Show profile
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>
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
                <dd class="stat-value category-tag">{{ formatSportType(route.activity.sportType) }}</dd>
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
            @if (mapFullscreen()) {
              <div class="elevation-profile-wrap" [class.show-profile-hint-elevation]="showProfileHint()">
                <app-elevation-profile
                  [elevations]="route.route.elevations"
                  [cumulativeDistances]="route.route.cumulativeDistances"
                  [coordinates]="route.route.coordinates"
                  [totalDistanceMeters]="route.activity.distanceMeters"
                  (hoveredPosition)="onElevationHover($event)"
                />
              </div>
            }
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

    .route-title-link {
      align-items: center;
      color: #14211b;
      cursor: pointer;
      display: inline-flex;
      gap: 4px;
      max-width: 100%;
      overflow: hidden;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .route-title-link:hover {
      color: #1f6f50;
      text-decoration: underline;
    }

    .route-title-icon {
      color: #63746a;
      flex-shrink: 0;
    }

    .route-title-link:hover .route-title-icon {
      color: #1f6f50;
    }

    .detail-menu-wrapper {
      flex-shrink: 0;
      position: relative;
    }

    .detail-menu-trigger {
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: #63746a;
      cursor: pointer;
      display: inline-flex;
      font-size: 1.125rem;
      font-weight: 700;
      justify-content: center;
      letter-spacing: 2px;
      line-height: 1;
      min-height: 28px;
      min-width: 28px;
      padding: 0;
    }

    .detail-menu-trigger:hover {
      background: #eef5f0;
      border-color: #dce6df;
      color: #14211b;
    }

    .detail-dropdown {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgb(20 33 27 / 18%);
      list-style: none;
      min-width: 160px;
      padding: 4px;
      position: absolute;
      right: 0;
      top: 100%;
      z-index: 1000;
    }

    .detail-dropdown-item {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: #314b3f;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 10px;
      min-height: 34px;
      padding: 6px 10px;
      text-align: left;
      white-space: nowrap;
      width: 100%;
    }

    .detail-dropdown-item:hover {
      background: #eef5f0;
    }

    .detail-dropdown-icon {
      color: #a0b4a6;
      flex-shrink: 0;
    }

    .detail-dropdown-item:hover .detail-dropdown-icon {
      color: #63746a;
    }

    .elevation-profile-wrap {
      margin-top: 10px;
    }

    .show-profile-hint-elevation {
      animation: hint-pulse 5s ease-out;
      border: 2px solid #cf3a2a;
      border-radius: 6px;
      display: inline-block;
      padding: 3px;
    }

    @keyframes hint-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgb(207 58 42 / 60%); }
      20% { box-shadow: 0 0 0 6px rgb(207 58 42 / 0%); }
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

    .sport-type-filter {
      max-height: 320px;
      min-width: 180px;
      overflow-y: auto;
    }

    .sport-type-group-header {
      align-items: center;
      color: #63746a;
      cursor: default;
      display: flex;
      font-size: 0.6875rem;
      font-weight: 800;
      gap: 6px;
      letter-spacing: 0.06em;
      padding: 8px 12px 4px;
      text-transform: uppercase;
    }

    .sport-type-group-header:hover {
      background: transparent;
    }

    .sport-type-option {
      padding-left: 0;
    }

    .sport-type-label {
      margin-left: 24px;
    }
  `],
})
export class MapPage implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  protected readonly filtersService = inject(FiltersService);
  private readonly routeRendererService = inject(RouteRendererService);
  private readonly toastService = inject(ToastService);
  private readonly gpxExportService = inject(GpxExportService);

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

  protected readonly sportTypeFilter = signal<string | null>(null);
  protected readonly detailMenuOpen = signal(false);
  protected readonly showProfileHint = signal(false);

  protected readonly sportTypeGroups = computed<{ category: ActivityCategory; sportTypes: string[] }[]>(() => {
    const routes = this.allRoutes();
    const seen = new Set<string>();
    const groups = new Map<ActivityCategory, Set<string>>();
    for (const r of routes) {
      if (seen.has(r.activity.sportType)) { continue; }
      seen.add(r.activity.sportType);
      const cat = mapSportTypeToCategory(r.activity.sportType);
      if (!groups.has(cat)) { groups.set(cat, new Set()); }
      groups.get(cat)!.add(r.activity.sportType);
    }
    const order: ActivityCategory[] = ['ride', 'run', 'walk', 'water', 'paddling', 'winter', 'other'];
    return order
      .filter((cat) => groups.has(cat))
      .map((cat) => ({ category: cat, sportTypes: [...groups.get(cat)!].sort() }));
  });

  protected readonly filteredRoutes = computed(() => {
    const routes = this.allRoutes();
    const sportFilter = this.sportTypeFilter();
    const fromDate = this.filtersService.dateFrom();
    const toDate = this.filtersService.dateTo();
    return routes.filter((r) => {
      if (sportFilter) {
        if (sportFilter.startsWith('__cat__')) {
          const cat = sportFilter.slice(7) as ActivityCategory;
          if (mapSportTypeToCategory(r.activity.sportType) !== cat) { return false; }
        } else {
          if (r.activity.sportType !== sportFilter) { return false; }
        }
      }
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

  protected onSportTypeChange(value: string): void {
    this.sportTypeFilter.set(value === '' ? null : value);
    this.filterMenuOpen.set(false);
  }

  protected onCategoryFilterChange(category: ActivityCategory): void {
    this.sportTypeFilter.set('__cat__' + category);
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
    globalThis.addEventListener('click', () => this.detailMenuOpen.set(false));
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
  protected formatSportType = formatSportType;
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
    this.routeRendererService.clearHoverPoint();
    if (this.selectedActivityId()) {
      this.router.navigate(['/map']);
    }
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
    this.routeRendererService.deselectRoute();
    this.router.navigate(['/map']);
  }

  protected syncActivities(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected toggleDetailMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.detailMenuOpen.update((v) => !v);
  }

  protected async downloadDetailGpx(event: MouseEvent, route: MapRouteFeature): Promise<void> {
    event.stopPropagation();
    this.detailMenuOpen.set(false);
    const result = await this.gpxExportService.exportActivity(route.activity);
    if (!result.success) {
      this.toastService.show(result.reason);
    }
  }

  protected async showProfile(event: MouseEvent, route: MapRouteFeature): Promise<void> {
    event.stopPropagation();
    this.detailMenuOpen.set(false);
    if (!this.mapFullscreen()) {
      this.mapFullscreen.set(true);
    }
    const settings = await this.repositories.settings.getOrCreateDefault();
    const hintCount = (settings as any).showProfileHintCount ?? 0;
    if (hintCount < 5) {
      this.showProfileHint.set(true);
      await this.repositories.settings.put({ ...settings, showProfileHintCount: hintCount + 1 } as any);
      setTimeout(() => this.showProfileHint.set(false), 5000);
    }
  }

  protected navigateToActivity(activity: import('../storage/storage.models').ActivityRecord): void {
    this.router.navigate(['/activities'], { queryParams: { focusActivityId: activity.id } });
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

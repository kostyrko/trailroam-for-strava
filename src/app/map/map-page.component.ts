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
import { ElevationProfileComponent } from './elevation-profile.component';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { type MapRouteFeature } from './mock-routes';
import { FiltersService, CATEGORY_COLORS, isAfterOrEqual, isBeforeOrEqual, type DatePreset } from '../shared/filters.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { RouteRendererService } from './route-renderer.service';
import { type ActivityCategory } from '../storage/storage.models';
import { formatSportType, formatCategory, mapSportTypeToCategory } from '../shared/activity-category';
import { ToastService } from '../shared/toast.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { GpxExportService } from '../shared/gpx-export.service';
import { ConfirmService } from '../shared/confirm.service';
import { IconComponent } from '../shared/icon.component';
import { MapActivityPanelComponent } from './map-activity-panel.component';

function formatDurationHours(seconds: number | undefined): string {
  if (seconds === undefined || seconds === 0) { return '—'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) { return `${h}h ${m}m`; }
  return `${m}m`;
}

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
  imports: [MapLibreMapComponent, ElevationProfileComponent, LoadingSpinnerComponent, IconComponent, MapActivityPanelComponent],
  template: `
      @if (performanceWarning(); as warning) {
        <article class="notice-bar warning-state" role="alert">
          <p class="notice-bar-kicker">Performance notice</p>
          <p>{{ warning }}</p>
          <button class="notice-bar-dismiss" type="button" (click)="dismissPerformanceWarning()">Dismiss</button>
        </article>
      }

      @if (autoFilterHintBanner(); as hint) {
        <article class="notice-bar info-state" role="status">
          <p class="notice-bar-kicker">Auto-filtered</p>
          <p>{{ hint }}</p>
          <button class="notice-bar-dismiss" type="button" (click)="dismissAutoFilterHint()">Got it</button>
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

    <section class="map-page-layout" [class.map-page-layout--panel-open]="panelReady() && panelExpanded()" aria-labelledby="map-title">

      @if (!hasBasemapError()) {
        @if (panelReady()) {
          <app-map-activity-panel
            [routes]="filteredRoutes()"
            [totalRoutes]="allRoutes().length"
            [selectedActivityId]="selectedActivityId()"
            [hoveredActivityId]="hoveredActivityId()"
            [viewBounds]="panelViewportBounds()"
            [isFullscreen]="mapFullscreen()"
            [panelExpanded]="panelExpanded()"
            [noTransition]="panelNoTransition()"
            (panelExpandedChange)="onPanelExpandedChange($event)"
            (selectRoute)="onPanelSelectRoute($event)"
            (hoverRoute)="onPanelHoverRoute($event)"
            (visibleOnMapChange)="onPanelVisibleOnMapChange($event)"
            (downloadPanelGpx)="onDownloadPanelGpx($event)"
          />
        }
        <div class="map-filters-overlay">
          <div class="map-filters-row">
            <div class="toolbar-select" tabindex="0" (click)="toggleFilterMenu()" (keydown.enter)="toggleFilterMenu()" (blur)="closeFilterMenu()" aria-label="Filter by activity type">
              <span class="toolbar-select__trigger">
                @if (sportTypeFilter(); as sel) {
                  @if (sel.startsWith('__cat__')) {
                    <span class="cat-dot" [style.background]="CATEGORY_COLORS[sel.slice(7)]"></span>{{ formatCategory(sel.slice(7)) }}
                  } @else {
                    <span class="cat-dot" [style.background]="CATEGORY_COLORS[mapSportTypeToCategory(sel)]"></span>{{ formatSportType(sel) }}
                  }
                } @else {
                  All Activities
                }
                <app-icon name="chevron-down" [size]="12" strokeWidth="2" [class]="'toolbar-select__arrow'"></app-icon>
              </span>
              @if (filterMenuOpen()) {
                <ul class="toolbar-select__options sport-type-filter" (mousedown)="$event.preventDefault()" (click)="$event.stopPropagation()">
                  <li role="option" (click)="onSportTypeChange('')" [class.active]="!sportTypeFilter()">All Activities</li>
                  @for (group of sportTypeGroups(); track group.category) {
                    <li class="sport-type-group-header" role="option" (click)="onCategoryFilterChange(group.category)" [class.active]="sportTypeFilter() === '__cat__' + group.category">
                      <span class="cat-dot" [style.background]="CATEGORY_COLORS[group.category]"></span>{{ formatCategory(group.category) }}
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

            <div class="toolbar-select" [class.auto-filter-highlight]="autoFilterHighlight()" tabindex="0" (click)="autoFilterHighlight.set(false); datePresetOpen.set(!datePresetOpen())" (keydown.enter)="datePresetOpen.set(!datePresetOpen())" (blur)="datePresetOpen.set(false)" aria-label="Filter by date range">
              <span class="toolbar-select__trigger">
                <app-icon name="calendar" [size]="14" strokeWidth="2"></app-icon>
                {{ datePresetLabel() }}
                <app-icon name="chevron-down" [size]="12" strokeWidth="2" [class]="'toolbar-select__arrow'"></app-icon>
              </span>
              @if (datePresetOpen()) {
                <ul class="toolbar-select__options" (mousedown)="$event.preventDefault()" (click)="$event.stopPropagation()">
                  <li role="option" (click)="applyDatePreset('all')" [class.active]="datePreset() === 'all'">All dates</li>
                  <li role="option" (click)="applyDatePreset('7d')" [class.active]="datePreset() === '7d'">Last 7 days</li>
                  <li role="option" (click)="applyDatePreset('30d')" [class.active]="datePreset() === '30d'">Last 30 days</li>
                  <li role="option" (click)="applyDatePreset('year')" [class.active]="datePreset() === 'year'">This year</li>
                  <li role="option" (click)="applyDatePreset('custom')" [class.active]="datePreset() === 'custom'">Custom range</li>
                </ul>
              }
            </div>
          </div>

          @if (datePreset() === 'custom') {
            <div class="custom-date-fields">
              <label class="custom-date-field">
                <span class="custom-date-label">From</span>
                <input
                  class="custom-date-input"
                  type="date"
                  [value]="formatDateInput(filtersService.dateFrom())"
                  (change)="onDateFromChange($any($event.target).value)"
                />
              </label>
              <label class="custom-date-field">
                <span class="custom-date-label">To</span>
                <input
                  class="custom-date-input"
                  type="date"
                  [value]="formatDateInput(filtersService.dateTo())"
                  (change)="onDateToChange($any($event.target).value)"
                />
              </label>
            </div>
          }
        </div>

        @if (routesLoading() || (allRoutes().length > 0 && !routesRendered())) {
          <div class="map-loading-overlay">
            <app-loading-spinner />
          </div>
        } @else if (!noRouteActivity() && !selectedRoute() && !selectedActivityId() && allRoutes().length === 0 && !mapEmptyDismissed()) {
          <div class="map-empty-overlay" (click)="dismissMapEmpty()">
            <article class="empty-state map-empty-modal" aria-labelledby="map-empty-title">
              <button class="map-empty-close" type="button" (click)="dismissMapEmpty(); $event.stopPropagation()" aria-label="Close empty state notice">&times;</button>
              <p class="empty-state-kicker">No routes yet</p>
              <h2 id="map-empty-title">Synced GPS routes will appear here.</h2>
              <p>
                Start a sync to import Strava activities and show available route lines on this map.
              </p>
              <p class="privacy-note">Your data stays private — everything is stored locally in your browser.</p>
              <button class="primary-action" type="button" (click)="syncActivities()">Sync activities</button>
            </article>
          </div>
        }
        <app-maplibre-map
          [fullscreenOverride]="mapFullscreen()"
          (basemapLoadFailed)="showBasemapError()"
          (routeSelected)="selectRoute($event)"
          (fullscreenChanged)="mapFullscreen.set($event)"
          (routesRendered)="onRoutesRendered()"
          (viewportChanged)="onViewportChanged($event)"
        />
        @if (selectedRoute(); as route) {
          <article class="route-detail route-detail-overlay" aria-label="Selected route details">
            <div class="route-detail-header">
              <h2 class="route-detail-title">
                <button class="route-title-link" type="button" (click)="navigateToActivity(route.activity)">
                  <span class="route-title-text" [title]="route.name">{{ route.name }}</span>
                  <app-icon name="external-link" [size]="14" strokeWidth="2" [class]="'route-title-icon'"></app-icon>
                </button>
              </h2>
              <div class="detail-menu-wrapper">
                <button class="detail-menu-trigger" type="button" (click)="toggleDetailMenu($event)" aria-haspopup="menu" [attr.aria-expanded]="detailMenuOpen()">⋮</button>
                @if (detailMenuOpen()) {
                  <ul class="detail-dropdown" role="menu" (click)="$event.stopPropagation()">
                    <li role="none">
                      <button class="detail-dropdown-item" role="menuitem" (click)="downloadDetailGpx($event, route)">
                        <app-icon name="download" [size]="16" strokeWidth="2" [class]="'detail-dropdown-icon'"></app-icon>
                        Download GPX
                      </button>
                    </li>
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
                  <button class="strava-link" type="button" (click)="openOnStrava($event, route.activity)">
                    <app-icon name="external-link" [size]="14" strokeWidth="2"></app-icon>
                    Open in Strava
                  </button>
                </dd>
              </div>
            </dl>
            @if (route.route.elevations && route.route.elevations.length > 0) {
              <div class="elevation-profile-wrap">
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
    .route-detail-overlay {
      background: #ffffff;
      border: 1px solid #cbd8d0;
      border-radius: 8px;
      bottom: 52px;
      box-shadow: 0 4px 20px rgb(20 33 27 / 25%);
      box-sizing: border-box;
      margin: 0;
      max-width: 380px;
      padding: 12px 16px;
      position: fixed;
      right: 24px;
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
      background: transparent;
      border: 0;
      color: #14211b;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: inherit;
      gap: 4px;
      min-width: 0;
      padding: 0;
      width: 100%;
    }

    .route-title-text {
      min-width: 0;
      overflow: hidden;
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
      background: transparent;
      border: 0;
      color: #1f6f50;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 4px;
      padding: 0;
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

    .activities-toolbar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }

    .toolbar-select {
      cursor: pointer;
      outline: none;
      position: relative;
      user-select: none;
    }

    .toolbar-select.auto-filter-highlight .toolbar-select__trigger {
      border-color: #dc2626;
      box-shadow: 0 0 0 2px rgb(220 38 38 / 25%);
      transition: border-color 0.5s ease, box-shadow 0.5s ease;
    }

    .toolbar-select__trigger {
      align-items: center;
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      color: #14211b;
      display: inline-flex;
      font-size: 0.875rem;
      gap: 8px;
      min-height: 44px;
      min-width: 180px;
      padding: 0 14px;
    }

    .toolbar-select__arrow {
      color: #a0b4a6;
      flex-shrink: 0;
      margin-left: auto;
    }

    .toolbar-select__options {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgb(20 33 27 / 15%);
      left: 0;
      list-style: none;
      margin: 4px 0 0;
      min-width: 100%;
      padding: 4px;
      position: absolute;
      top: 100%;
      z-index: 20;
    }

    .toolbar-select__options li {
      align-items: center;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      white-space: nowrap;
    }

    .toolbar-select__options li:hover,
    .toolbar-select__options li.active {
      background: #eef5f0;
    }

    .sport-type-filter {
      max-height: 320px;
      min-width: 200px;
      overflow-y: auto;
    }

    .sport-type-group-header {
      color: #63746a;
      cursor: default;
      font-size: 0.6875rem;
      font-weight: 800;
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

    .cat-dot {
      border-radius: 50%;
      display: inline-block;
      height: 8px;
      width: 8px;
    }

    .custom-date-fields {
      align-items: center;
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-left: -60px;
      pointer-events: auto;
    }

    .custom-date-field {
      align-items: center;
      display: flex;
      gap: 6px;
    }

    .custom-date-label {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      color: #1f6f50;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 8px;
      text-transform: uppercase;
    }

    .custom-date-input {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      color: #14211b;
      font: inherit;
      font-size: 0.875rem;
      min-height: 44px;
      padding: 0 12px;
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

    .notice-bar.info-state {
      background: #fbf5e1;
      color: #7a621a;
      border-bottom-color: #d2b96d;
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

    .map-page-layout {
      display: flex;
      flex-direction: column;
      height: calc(100dvh - 64px);
      position: relative;
    }

    .map-page-layout--panel-open ::ng-deep .map-shell .maplibregl-ctrl-top-left {
      margin: 12px 0 0 340px;
      top: 12px !important;
    }

    .map-page-layout ::ng-deep app-maplibre-map {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
      position: relative;
    }

    .map-page-layout ::ng-deep .map-shell {
      flex: 1;
      height: auto;
      margin: 0;
      min-height: 0;
    }

    .map-page-layout ::ng-deep .map-shell.map-fullscreen {
      position: fixed;
    }

    .map-page-layout ::ng-deep .maplibregl-ctrl-top-right {
      z-index: 150 !important;
    }

    .map-page-layout ::ng-deep .maplibregl-ctrl-group {
      z-index: 150 !important;
    }

    .map-page-layout ::ng-deep .maplibregl-ctrl-group button {
      z-index: 150 !important;
      position: relative;
    }

    .map-page-layout ::ng-deep .map-fit-btn,
    .map-page-layout ::ng-deep .map-layer-wrapper {
      z-index: 150 !important;
    }

    .map-filters-overlay {
      align-items: center;
      display: flex;
      flex-direction: column;
      gap: 6px;
      left: 0;
      padding: 10px 14px;
      pointer-events: none;
      position: absolute;
      top: 0;
      width: 100%;
      z-index: 100;
    }

    .map-filters-row {
      align-items: center;
      display: flex;
      gap: 10px;
      justify-content: center;
      pointer-events: auto;
    }

    .map-filters-overlay .toolbar-select {
      pointer-events: auto;
    }

    .map-loading-overlay {
      align-items: center;
      background: rgb(0 0 0 / 50%);
      display: flex;
      height: 100%;
      justify-content: center;
      left: 0;
      position: absolute;
      top: 0;
      width: 100%;
      z-index: 200;
    }

    .map-empty-overlay {
      align-items: center;
      background: rgb(0 0 0 / 10%);
      display: flex;
      height: 100%;
      justify-content: center;
      left: 0;
      position: absolute;
      top: 0;
      width: 100%;
      z-index: 200;
    }

    .map-empty-modal {
      margin-top: 0;
      position: relative;
    }

    .map-empty-close {
      align-items: center;
      background: transparent;
      border: 0;
      color: #a0b4a6;
      cursor: pointer;
      display: inline-flex;
      font-size: 1.5rem;
      justify-content: center;
      line-height: 1;
      min-height: 28px;
      min-width: 28px;
      padding: 0;
      position: absolute;
      right: 8px;
      top: 8px;
    }

    .map-empty-close:hover {
      color: #63746a;
    }

    `],
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
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);

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
  private readonly autoFilterHintDismissed = signal(false);
  protected readonly autoFilterHighlight = signal(false);
  private readonly dataLoaded = signal(false);
  private readonly mapReady = signal(false);
  private readonly retryDestroyed = signal(false);
  private renderRetryCount = 0;
  private readonly MAX_RENDER_RETRIES = 20;

  protected readonly routesLoading = signal(true);
  protected readonly routesRendered = signal(false);
  protected readonly mapEmptyDismissed = signal(false);
  protected dismissMapEmpty(): void {
    this.mapEmptyDismissed.set(true);
  }

  protected readonly sportTypeFilter = this.filtersService.sportTypeFilter;
  protected readonly detailMenuOpen = signal(false);
  protected readonly hoveredActivityId = signal<string | null>(null);
  protected readonly panelVisibleOnMap = signal(false);
  protected readonly panelViewportBounds = signal<[[number, number], [number, number]] | null>(null);
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
        const dates = routes.map((r) => new Date(r.activity.startDate).getTime()).filter((t) => !isNaN(t));
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

  protected onNameSearchChange(value: string): void {
    this.filtersService.setNameSearch(value);
  }

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
    const search = this.filtersService.nameSearch().toLowerCase().trim();
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
      if (search && !r.activity.name.toLowerCase().includes(search)) { return false; }
      return true;
    });
  });

  protected readonly visibleRouteCount = computed(() => this.filteredRoutes().length);

  protected readonly statDistance = computed(() => {
    const routes = this.filteredRoutes();
    const totalDistanceMeters = routes.reduce((s, r) => s + (r.activity.distanceMeters ?? 0), 0);
    const distanceKm = totalDistanceMeters / 1000;
    if (totalDistanceMeters === 0) { return '0 km'; }
    return distanceKm >= 100 ? `${distanceKm.toFixed(0)} km` : `${distanceKm.toFixed(1)} km`;
  });

  protected readonly statMovingTime = computed(() => {
    const routes = this.filteredRoutes();
    const totalMovingSeconds = routes.reduce((s, r) => s + (r.activity.movingTimeSeconds ?? 0), 0);
    if (totalMovingSeconds === 0) { return '0h 0m'; }
    return formatDurationHours(totalMovingSeconds);
  });

  protected readonly statAvgSpeed = computed(() => {
    const routes = this.filteredRoutes();
    const activitiesWithSpeed = routes.filter((r) => computeSpeed(r.activity.averageSpeedMetersPerSecond, r.activity.distanceMeters, r.activity.movingTimeSeconds) !== undefined);
    if (activitiesWithSpeed.length === 0) { return '—'; }
    const speedsMs = activitiesWithSpeed.map((r) => computeSpeed(r.activity.averageSpeedMetersPerSecond, r.activity.distanceMeters, r.activity.movingTimeSeconds)!);
    const avgMs = speedsMs.reduce((s, v) => s + v, 0) / speedsMs.length;
    return `${(avgMs * 3.6).toFixed(1)} km/h`;
  });

  protected readonly visiblePointCount = computed(() =>
    this.filteredRoutes().reduce((sum, r) => sum + r.coordinates.length, 0),
  );

  protected readonly autoFilterTriggered = signal(false);

  protected readonly autoFilterHintBanner = computed<string | null>(() => {
    if (this.autoFilterHintDismissed()) { return null; }
    if (!this.autoFilterTriggered()) { return null; }
    return 'Filtered to "This year" for better performance. You can change the date range in the filter below.';
  });

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

  protected readonly selectedActivityId = computed(() => this.activityIdParam() ?? this.selectedMapRoute()?.activityId ?? null);
  protected readonly hasBasemapError = computed(() => this.basemapErrorParam() || this.mapBasemapError());

  protected readonly selectedRoute = computed<MapRouteFeature | null>(() => {
    const activityId = this.selectedActivityId();
    if (activityId) {
      return this.allRoutes().find((r) => r.activityId === activityId) ?? null;
    }
    return this.selectedMapRoute();
  });

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
    return !this.allRoutes().some((r) => r.activityId === activityId);
  });

  protected readonly noRouteActivityName = computed(() => {
    return this.selectedActivityId() ?? 'Unknown';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.retryDestroyed.set(true));
    this.loadRoutes().then(() => this.restorePanelState());
    globalThis.addEventListener('click', (e) => {
      this.detailMenuOpen.set(false);
      if (!(e.target as HTMLElement)?.closest('.toolbar-select')) {
        this.filterMenuOpen.set(false);
        this.datePresetOpen.set(false);
      }
    });
    this.dataRefresh.refresh$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.routesLoading.set(true);
      this.loadRoutes();
    });
    effect(() => {
      this.dataLoaded();
      this.mapReady();
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
        routes.push({
          activityId: routeRecord.activityId,
          activity,
          route: routeRecord,
          coordinates: routeRecord.coordinates,
          name: activity.name,
        });
      }

      this.allRoutes.set(routes);
      this.dataLoaded.set(true);

      const totalPoints = routes.reduce((sum, r) => sum + r.coordinates.length, 0);
      if (totalPoints > POINTS_WARN_THRESHOLD / 2 && this.filtersService.datePreset() === 'all' && !this.filtersService.userInteracted) {
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
    console.log(`[TRACE] tryRenderRoutes from ${src}: dataLoaded=${this.dataLoaded()}, mapReady=${this.mapReady()}, mapComp=${!!this.mapComponent}, filteredRoutes=${this.filteredRoutes().length}`);
    if (!this.dataLoaded() || !this.mapReady()) { console.log(`[TRACE] tryRenderRoutes from ${src}: SKIP (not ready)`); return; }
    const routes = this.allRoutes();
    const mapComp = this.mapComponent;
    const selectId = this.selectedActivityId();
    if (!mapComp) { console.log(`[TRACE] tryRenderRoutes from ${src}: SKIP (no mapComp)`); return; }
    mapComp.renderRouteFeatures(routes, selectId ?? undefined);
  }

  protected onRoutesRendered(): void {
    setTimeout(() => this.routesRendered.set(true), 500);
  }

  private scheduleRenderRetry(): void {
    if (this.dataLoaded() && this.mapReady()) { return; }
    if (this.renderRetryCount >= this.MAX_RENDER_RETRIES) { return; }
    this.renderRetryCount++;
    setTimeout(() => {
      if (this.retryDestroyed()) { return; }
      if (this.dataLoaded() && this.mapReady()) {
        console.log('[TRACE] scheduleRenderRetry: condition met, calling tryRenderRoutes');
        this.tryRenderRoutes('retry');
      } else {
        console.log(`[TRACE] scheduleRenderRetry: retry ${this.renderRetryCount}/${this.MAX_RENDER_RETRIES}, still waiting. dataLoaded=${this.dataLoaded()}, mapReady=${this.mapReady()}`);
        this.scheduleRenderRetry();
      }
    }, 100);
  }


  protected computeSpeed = computeSpeed;
  protected formatDistance = formatDistance;
  protected formatSpeed = formatSpeed;
  protected formatDuration = formatDuration;
  protected formatDate = formatDate;
  protected formatDateInput = formatDateInput;
  protected formatSportType = formatSportType;
  protected formatCategory = formatCategory;
  protected mapSportTypeToCategory = mapSportTypeToCategory;
  protected onDateFromChange = this.filtersService.setDateFrom.bind(this.filtersService);
  protected onDateToChange = this.filtersService.setDateTo.bind(this.filtersService);

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
    this.selectedMapRoute.set(route);
    if (this.selectedActivityId()) {
      this.router.navigate(['/map'], { queryParams: {}, replaceUrl: true });
    }
    setTimeout(() => {
      document.querySelector('.route-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
    this.scheduleEmphasisUpdate();
  }

  protected clearSelectedRoute(): void {
    this.selectedMapRoute.set(null);
    this.routeRendererService.deselectRoute();
    this.routeRendererService.clearHoverPoint();
    if (this.selectedActivityId()) {
      this.router.navigate(['/map']);
    }
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
    this.routeRendererService.deselectRoute();
    this.router.navigate(['/map']);
    this.scheduleEmphasisUpdate();
  }

  protected syncActivities(): void {
    this.dataRefresh.startSync('Syncing...');
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

  protected onPanelSelectRoute(route: MapRouteFeature): void {
    this.hoveredActivityId.set(null);
    this.routeRendererService.selectRoute(route.activityId);
    this.routeRendererService.fitToRoute(route.coordinates, route.route.bounds);
    this.selectedMapRoute.set(route);
    if (this.selectedActivityId()) {
      this.router.navigate(['/map'], { queryParams: {}, replaceUrl: true });
    }
    this.scheduleEmphasisUpdate();
  }

  protected onPanelHoverRoute(route: MapRouteFeature | null): void {
    this.hoveredActivityId.set(route?.activityId ?? null);
  }

  protected onPanelExpandedChange(expanded: boolean): void {
    this.panelExpanded.set(expanded);
    this.persistPanelState(expanded);
  }

  protected async onDownloadPanelGpx(routes: MapRouteFeature[]): Promise<void> {
    const activities = routes.map((r) => r.activity);
    if (activities.length === 0) { return; }
    const count = await this.gpxExportService.buildZip(new (await import('jszip')).default(), activities);
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
      if (!confirmed) { return; }
    }
    await this.gpxExportService.exportActivitiesAsZip(activities);
  }

  private async restorePanelState(): Promise<void> {
    if (this.panelLoaded) { return; }
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
    if (this.emphasisTimeout) { clearTimeout(this.emphasisTimeout); }
    this.emphasisTimeout = setTimeout(() => this.updateEmphasis(), 50);
  }

  private updateEmphasis(): void {
    if (!this.dataLoaded()) { return; }
    const filtered = this.filteredRoutes();
    const selectedId = this.selectedRoute()?.activityId ?? null;

    if (filtered.length === this.allRoutes().length && !selectedId) {
      this.routeRendererService.clearEmphasis();
      return;
    }

    const matchingIds = new Set(filtered.map((r) => r.activityId));
    this.routeRendererService.setEmphasis(matchingIds, selectedId);
  }
}

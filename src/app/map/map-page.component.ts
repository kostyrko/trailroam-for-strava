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
  imports: [MapLibreMapComponent, ElevationProfileComponent, LoadingSpinnerComponent],
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

    <section class="map-page-layout" aria-labelledby="map-title">

      @if (!hasBasemapError()) {
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
                <svg class="toolbar-select__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
              @if (filterMenuOpen()) {
                <ul class="toolbar-select__options sport-type-filter" (mousedown)="$event.preventDefault()">
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

            <div class="toolbar-select" tabindex="0" (click)="datePresetOpen.set(!datePresetOpen())" (keydown.enter)="datePresetOpen.set(!datePresetOpen())" (blur)="datePresetOpen.set(false)" aria-label="Filter by date range">
              <span class="toolbar-select__trigger">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {{ datePresetLabel() }}
                <svg class="toolbar-select__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
              @if (datePresetOpen()) {
                <ul class="toolbar-select__options" (mousedown)="$event.preventDefault()">
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

        @if (routesLoading()) {
          <div class="map-loading-overlay">
            <app-loading-spinner />
          </div>
        } @else if (allRoutes().length > 0 && filteredRoutes().length === 0 && !mapFilterEmptyDismissed()) {
          <div class="map-empty-overlay" (click)="dismissMapFilterEmpty()">
            <article class="empty-state map-empty-modal" aria-labelledby="map-empty-match-title">
              <button class="map-empty-close" type="button" (click)="dismissMapFilterEmpty(); $event.stopPropagation()" aria-label="Close empty state notice">&times;</button>
              <p class="empty-state-kicker">No matching activities</p>
              <h2 id="map-empty-match-title">No activities match your filters.</h2>
              <p>Try adjusting your search or filter criteria to find what you're looking for.</p>
            </article>
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
        />
        @if (selectedRoute(); as route) {
          <article class="route-detail route-detail-overlay" aria-label="Selected route details">
            <div class="route-detail-header">
              <h2 class="route-detail-title">
                <button class="route-title-link" type="button" (click)="navigateToActivity(route.activity)">
                  {{ route.name }}
                  <svg class="route-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
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
      left: 24px;
      margin: 0;
      max-width: 380px;
      padding: 12px 16px;
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
      background: transparent;
      border: 0;
      color: #14211b;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: inherit;
      gap: 4px;
      max-width: 100%;
      overflow: hidden;
      padding: 0;
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
  private readonly routeRendererService = inject(RouteRendererService);
  private readonly toastService = inject(ToastService);
  private readonly gpxExportService = inject(GpxExportService);
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

  protected readonly routesLoading = signal(true);
  protected readonly mapEmptyDismissed = signal(false);
  protected readonly mapFilterEmptyDismissed = signal(false);

  protected dismissMapEmpty(): void {
    this.mapEmptyDismissed.set(true);
  }

  protected dismissMapFilterEmpty(): void {
    this.mapFilterEmptyDismissed.set(true);
  }

  protected readonly sportTypeFilter = this.filtersService.sportTypeFilter;
  protected readonly detailMenuOpen = signal(false);
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
    this.loadRoutes();
    globalThis.addEventListener('click', () => this.detailMenuOpen.set(false));
    this.dataRefresh.refresh$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.routesLoading.set(true);
      this.loadRoutes();
    });
    effect(() => {
      const filtered = this.filteredRoutes();
      this.renderRoutesOnMap();
      if (this.allRoutes().length > 0 && filtered.length === 0) {
        this.mapFilterEmptyDismissed.set(false);
        this.closeFilterMenu();
        this.datePresetOpen.set(false);
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.allRoutes().length > 0) {
      this.renderRoutesOnMap();
    }
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

      const totalPoints = routes.reduce((sum, r) => sum + r.coordinates.length, 0);
      if (totalPoints > POINTS_WARN_THRESHOLD / 2 && this.filtersService.datePreset() === 'all' && !this.filtersService.userInteracted) {
        this.applyDatePreset('year');
      }
    } catch {
    } finally {
      try {
        this.renderRoutesOnMap();
      } catch (e) {
        console.error('Failed to render routes on map:', e);
      }
      this.routesLoading.set(false);
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

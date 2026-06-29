import { Component, computed, effect, inject, signal, DestroyRef, ElementRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivityParserService } from '../shared/activity-parser.service';
import { ImportActivityDialog } from '../shared/import-activity-dialog.component';
import { EditActivityDialog } from '../shared/edit-activity-dialog.component';
import { generateId } from '../shared/uuid';

const SPORT_TYPE_EMOJI: Record<string, string> = {
  Ride: '🚴', GravelRide: '🚴', MountainBikeRide: '🚵', EBikeRide: '🚴', EMountainBikeRide: '🚵', VirtualRide: '🚴',
  Run: '🏃', TrailRun: '🏃', VirtualRun: '🏃',
  Walk: '🚶', Hike: '🥾',
  Swim: '🏊',
  Kayaking: '🛶', Canoeing: '🛶', StandUpPaddling: '🛶', Rowing: '🛶',
  AlpineSki: '⛷️', BackcountrySki: '⛷️', NordicSki: '⛷️', Snowboard: '🏂', Snowshoe: '🥾',
  RockClimbing: '🧗', Golf: '🏌️',
  Other: '🏋️', Workout: '🏋️',
};

function sportTypeEmoji(activity: { sportType: string; activityCategory?: string }): string {
  return SPORT_TYPE_EMOJI[activity.sportType] ?? SPORT_TYPE_EMOJI['Other'] ?? '🏋️';
}
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { FiltersService, CATEGORY_COLORS, isAfterOrEqual, isBeforeOrEqual, type DatePreset } from '../shared/filters.service';
import { ToastService } from '../shared/toast.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { ConfirmService } from '../shared/confirm.service';
import { MatDialog } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon.component';
import { GpxExportService } from '../shared/gpx-export.service';
import { StravaSessionService } from '../strava/strava-session.service';
import { StravaRouteNormalizer } from '../strava/strava-route-normalizer';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { DateRangePickerComponent } from '../shared/date-range-picker.component';
import { RouteSparklineComponent } from './route-sparkline.component';
import { ActivityDetailPanelComponent } from './activity-detail-panel.component';
import { type ActivityCategory, type ActivityRecord, type ActivityRouteRecord, type RouteGeometryRecord } from '../storage/storage.models';
import { formatSportType, formatCategory, mapSportTypeToCategory } from '../shared/activity-category';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

function formatDistance(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatElevation(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${meters.toFixed(0)} m`;
}

function computeSpeed(
  metersPerSecond: number | undefined,
  distanceMeters: number | undefined,
  movingTimeSeconds: number | undefined,
): number | undefined {
  if (metersPerSecond !== undefined && metersPerSecond !== 0) { return metersPerSecond; }
  if (distanceMeters && movingTimeSeconds) { return distanceMeters / movingTimeSeconds; }
  return undefined;
}

function formatSpeedKmh(speedMetersPerSecond: number | undefined): string {
  if (speedMetersPerSecond === undefined || speedMetersPerSecond === 0) { return '—'; }
  return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h`;
}

function formatSpeed(metersPerSecond: number | undefined): string {
  if (metersPerSecond === undefined || metersPerSecond === 0) { return '—'; }
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

function formatHeartrate(bpm: number | undefined): string {
  if (bpm === undefined || bpm === 0) { return '—'; }
  return `${bpm.toFixed(0)} bpm`;
}

function formatDurationHours(seconds: number | undefined): string {
  if (seconds === undefined || seconds === 0) { return '—'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) { return `${h}h ${m}m`; }
  return `${m}m`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

export type SortColumn = 'date' | 'name' | 'source' | 'status' | 'type' | 'distance' | 'speed' | 'time' | 'route';

function activitySourceSortValue(a: ActivityRecord): number {
  if (a.provider === 'strava') return 0;
  return 1;
}

function activityStatusSortValue(a: ActivityRecord): number {
  const s = a.activityStatus ?? 'completed';
  if (s === 'completed') return 0;
  return 1;
}

function routeSortValue(status: string): number {
  switch (status) {
    case 'route_synced': return 0;
    case 'no_route': return 1;
    case 'empty_route': return 2;
    case 'route_failed': return 3;
    case 'invalid_coordinates': return 4;
    case 'skipped': return 5;
    case 'fetching': return 6;
    default: return 7;
  }
}

function routeStatusLabel(status: string): string {
  switch (status) {
    case 'route_synced': return 'Route';
    case 'no_route': return 'No route';
    case 'empty_route': return 'Empty route';
    case 'route_failed': return 'Failed';
    case 'invalid_coordinates': return 'Invalid coords';
    case 'skipped': return 'Skipped';
    case 'fetching': return 'Fetching…';
    default: return '—';
  }
}

@Component({
  selector: 'app-activities-page',
  imports: [LoadingSpinnerComponent, RouteSparklineComponent, ActivityDetailPanelComponent, IconComponent, DateRangePickerComponent],
  template: `
    <section class="route-page" aria-labelledby="activities-title" [class.route-page--empty]="status() === 'empty'">

      <div class="activities-header">
        <div class="activities-header__title-row">
          <h1 id="activities-title">Activities</h1>
          <div class="local-storage-indicator" title="Activity data is stored locally in this browser">
            <app-icon name="lock" [size]="14" strokeWidth="2" [class]="'ls-icon'"></app-icon>
            <span>Stored locally in this browser</span>
            <app-icon name="info" [size]="14" strokeWidth="2" [class]="'ls-info-icon'"></app-icon>
          </div>
        </div>
      </div>

      @if (status() === 'loading') {
        <div class="loading-state" aria-label="Loading activities">
          <app-loading-spinner />
        </div>
      } @else {
        @if (showLocalNotice()) {
          <div class="local-data-notice" role="status">
            <app-icon name="lock" [size]="18" strokeWidth="2" [class]="'local-data-notice__icon'"></app-icon>
            <div class="local-data-notice__content">
              <strong>All your activity data is stored locally in your browser.</strong>
              <span>No data is sent to any server. Use Sync with Strava to import new activities.</span>
            </div>
            <button class="local-data-notice__dismiss" type="button" (click)="dismissLocalNotice()" aria-label="Dismiss local storage notice">
              <app-icon name="x" [size]="16" strokeWidth="2"></app-icon>
            </button>
          </div>
        }

        <div class="activities-toolbar">
          <div class="search-field">
            <app-icon name="search" [size]="16" strokeWidth="2" [class]="'search-field__icon'"></app-icon>
            <input
              class="search-field__input"
              type="text"
              aria-label="Search activities"
              placeholder="Search activities..."
              [value]="nameSearch()"
              (input)="onNameSearchChange($any($event.target).value)"
            />
            @if (nameSearch()) {
              <button class="search-field__clear" type="button" (click)="onNameSearchChange('')" aria-label="Clear search">&times;</button>
            }
          </div>

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

          <div class="toolbar-select" tabindex="0" (click)="datePresetOpen.set(!datePresetOpen())" (keydown.enter)="datePresetOpen.set(!datePresetOpen())" (keydown.escape)="datePresetOpen.set(false)" aria-label="Filter by date range">
            <span class="toolbar-select__trigger">
              <app-icon name="calendar" [size]="14" strokeWidth="2"></app-icon>
              {{ datePresetLabel() }}
              <app-icon name="chevron-down" [size]="12" strokeWidth="2" [class]="'toolbar-select__arrow'"></app-icon>
            </span>
          </div>

          @if (datePresetOpen()) {
            <div class="drp-backdrop" (mousedown)="datePresetOpen.set(false)"></div>
            <div class="drp-floating">
              <app-date-range-picker
                [appliedDateFrom]="dateFrom()"
                [appliedDateTo]="dateTo()"
                (applied)="onRangeApplied($event)"
                (closed)="datePresetOpen.set(false)"
              />
            </div>
          }
          <button class="import-btn" type="button" (click)="openFilePicker()">
            <app-icon name="upload" [size]="14" strokeWidth="2"></app-icon>
            Import Activity
          </button>
          <input
            #fileInput
            type="file"
            accept=".gpx,.fit,.tcx"
            style="display:none"
            (change)="onFileSelected($event)"
          />
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--activities">
              <app-icon name="activity" [size]="18" strokeWidth="2"></app-icon>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statCount() }}</span>
              <span class="stat-card__label">Activities</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--route">
              <app-icon name="route" [size]="18" strokeWidth="2"></app-icon>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statDistance() }}</span>
              <span class="stat-card__label">Total Distance</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--time">
              <app-icon name="clock" [size]="18" strokeWidth="2"></app-icon>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statMovingTime() }}</span>
              <span class="stat-card__label">Total Time</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--speed">
              <app-icon name="gauge" [size]="18" strokeWidth="2"></app-icon>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statAvgSpeed() }}</span>
              <span class="stat-card__label">Avg Speed</span>
            </div>
          </div>
        </div>

        <div class="source-filter-bar">
          <span class="source-filter-label">Filter by source:</span>
          @let sc = sourceFilterCounts();
          @let sf = sourceFilter();
          <button class="source-filter-chip" [class.source-filter-chip--active]="sf.size === 0" (click)="resetSourceFilter()">
            All Activities
            <span class="source-filter-count">{{ sc.all }}</span>
          </button>
          <button class="source-filter-chip" [class.source-filter-chip--active]="sf.has('strava')" (click)="toggleSourceFilter('strava')">
            ⚡ Strava (Synced)
            <span class="source-filter-count">{{ sc.strava }}</span>
          </button>
          <button class="source-filter-chip" [class.source-filter-chip--active]="sf.has('imported-completed')" (click)="toggleSourceFilter('imported-completed')">
            ⬆ Imported (Done)
            <span class="source-filter-count">{{ sc.importedCompleted }}</span>
          </button>
          <button class="source-filter-chip" [class.source-filter-chip--active]="sf.has('imported-planned')" (click)="toggleSourceFilter('imported-planned')">
            ◌ Imported (Planned)
            <span class="source-filter-count">{{ sc.importedPlanned }}</span>
          </button>
        </div>

        <div class="selected-actions-bar" [class.selected-actions-bar--active]="selectionCount() > 0">
            <div class="selected-actions-bar__summary">
              <app-icon name="check-circle" [size]="18" strokeWidth="2" [class]="'selected-actions-bar__check'"></app-icon>
              <span>{{ selectionCount() === 1 ? '1 activity selected' : selectionCount() + ' activities selected' }}</span>
            </div>
            <div class="selected-actions-bar__actions">
              <button class="selected-action selected-action--secondary" type="button" (click)="downloadSelectedGpx()">
                <app-icon name="download" [size]="16" strokeWidth="2"></app-icon>
                Download GPX
              </button>
              <button class="selected-action selected-action--danger" type="button" (click)="deleteSelected()">
                <app-icon name="trash-2" [size]="16" strokeWidth="2"></app-icon>
                Delete
              </button>
              <button class="selected-action selected-action--secondary" type="button" (click)="clearSelection()">
                <app-icon name="x" [size]="16" strokeWidth="2"></app-icon>
                Clear Selection
              </button>
            </div>
          </div>

        @if (status() !== 'empty') {
        <p class="activities-count">
          @if (totalFilteredCount() > pageSize()) {
            Showing page {{ currentPage() }} of {{ totalPages() }} · {{ totalFilteredCount() }} activities
          } @else {
            {{ totalFilteredCount() }} activities
          }
        </p>
        }

        @if (dragOver()) {
          <div class="import-drop-overlay" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)" (dragover)="onDragOver($event)">
            <div class="import-drop-card">
              <p class="import-drop-title">Drop activity file here</p>
              <p class="import-drop-sub">or click to browse</p>
              <p class="import-drop-formats">Supports: GPX • FIT • TCX</p>
            </div>
          </div>
        }

        <div class="activities-table-wrap" (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)">
          <table class="activities-table" aria-label="Imported activities">
            <thead>
              <tr>
                <th scope="col" class="col-checkbox">
                  <input
                    type="checkbox"
                    [checked]="allPageSelected()"
                    [indeterminate]="!allPageSelected() && selectionCount() > 0"
                    (change)="toggleSelectAllPage()"
                    aria-label="Select all visible activities"
                  />
                </th>
                <th scope="col" class="sortable" (click)="onSort('date')">Date{{ sortIndicator('date') }}</th>
                <th scope="col" class="col-sparkline"></th>
                <th scope="col" class="sortable" (click)="onSort('name')">Name{{ sortIndicator('name') }}</th>
                <th scope="col" class="sortable" (click)="onSort('source')">Source{{ sortIndicator('source') }}</th>
                <th scope="col" class="sortable" (click)="onSort('status')">Status{{ sortIndicator('status') }}</th>
                <th scope="col" class="sortable" (click)="onSort('type')">Type{{ sortIndicator('type') }}</th>
                <th scope="col" class="sortable" (click)="onSort('distance')">Distance{{ sortIndicator('distance') }}</th>
                <th scope="col" class="sortable" (click)="onSort('speed')">Speed{{ sortIndicator('speed') }}</th>
                <th scope="col" class="sortable" (click)="onSort('time')">Time{{ sortIndicator('time') }}</th>
                <th scope="col" class="sortable" (click)="onSort('route')">Route{{ sortIndicator('route') }}</th>
                <th scope="col" class="col-actions-header"></th>
              </tr>
            </thead>
            <tbody>
              @for (activity of filteredActivities(); track activity.id) {
                <tr class="activity-row" [class.clickable]="activity.hasRoute" [class.no-route]="!activity.hasRoute" [class.focus-highlight]="highlightActivityId() === activity.id" [class.row-selected]="selectedIds().has(activity.id)" [class.panel-open]="selectedActivity()?.id === activity.id" [attr.data-activity-id]="activity.id" (click)="navigateToActivity(activity)">
                  <td class="cell-checkbox" (click)="$event.stopPropagation()">
                    <input
                      type="checkbox"
                      [checked]="selectedIds().has(activity.id)"
                      (change)="toggleSelection(activity.id)"
                      [attr.aria-label]="'Select ' + activity.name"
                    />
                  </td>
                  <td class="cell-date cell-date-secondary">{{ formatDate(activity.startDate) }}</td>
                  <td class="cell-sparkline" (click)="$event.stopPropagation()">
                    @if (!routesCacheFilled() && activity.hasRoute) {
                      <span class="sparkline-loading" aria-label="Loading route preview"></span>
                    }
                    <app-route-sparkline [coordinates]="getRouteCoords(activity.id)" />
                  </td>
                  <td class="cell-name cell-name-bold">{{ activity.name }}</td>
                  <td class="cell-source">
                    @if (activity.provider === 'strava') {
                      <span class="source-badge source-badge--strava">⚡ Strava</span>
                    } @else {
                      <span class="source-badge source-badge--imported">⬆ Imported</span>
                    }
                  </td>
                  <td class="cell-status">
                    @let st = activity.activityStatus ?? 'completed';
                    @if (st === 'completed') {
                      <span class="status-badge status-badge--completed">✓ Completed</span>
                    } @else {
                      <span class="status-badge status-badge--planned">◌ Planned</span>
                    }
                  </td>
                  <td><span class="category-tag" [style.background]="categoryTagBg(activity.activityCategory)" [style.color]="categoryTagFg(activity.activityCategory)"><span class="cat-emoji">{{ sportTypeEmoji(activity) }}</span>{{ formatSportType(activity.sportType) }}</span></td>
                  <td class="cell-num cell-distance-bold">{{ formatDistance(activity.distanceMeters) }}</td>
                  <td class="cell-num">{{ formatSpeed(computeSpeed(activity.averageSpeedMetersPerSecond, activity.distanceMeters, activity.movingTimeSeconds)) }}</td>
                  <td class="cell-num">{{ formatDuration(activity.movingTimeSeconds) }}</td>
                  <td>
                    <span class="route-badge" [class.route-ok]="activity.routeSyncStatus === 'route_synced'"
                      >{{ routeStatusLabel(activity.routeSyncStatus) }}</span>
                  </td>
                  <td class="cell-actions">
                    <div class="activity-actions-cell">
                      @if (activity.hasRoute) {
                        <button
                          class="map-nav-btn"
                          type="button"
                          (click)="navigateToMap($event, activity)"
                          attr.aria-label="View '{{ activity.name }}' on map"
                          title="View on map"
                        >
                          <app-icon name="map" [size]="16" strokeWidth="2"></app-icon>
                        </button>
                      }
                      <div class="activity-menu-wrapper">
                      <button
                        class="activity-menu-trigger"
                        type="button"
                        aria-haspopup="menu"
                        [attr.aria-expanded]="openMenuId() === activity.id"
                        (click)="toggleActivityMenu($event, activity.id)"
                      >⋮</button>
                      @if (openMenuId() === activity.id) {
                        <ul class="activity-dropdown" [style]="menuStyle()" role="menu" (click)="$event.stopPropagation()">
                          <li role="none">
                            <button class="act-dropdown-item" role="menuitem" (click)="openOnStrava($event, activity)">
                              <app-icon name="external-link" [size]="16" strokeWidth="2" [class]="'act-dropdown-icon'"></app-icon>
                              Strava
                            </button>
                          </li>
                          <li role="none">
                            <button class="act-dropdown-item" [class.act-dropdown-item-disabled]="!activity.hasRoute" [disabled]="!activity.hasRoute" role="menuitem" (click)="downloadGpx($event, activity)">
                              <app-icon name="download" [size]="16" strokeWidth="2" [class]="'act-dropdown-icon'"></app-icon>
                              Download GPX
                            </button>
                          </li>
                          <li role="none">
                            <button class="act-dropdown-item" role="menuitem" (click)="editActivity($event, activity)">
                              <app-icon name="pencil" [size]="16" strokeWidth="2" [class]="'act-dropdown-icon'"></app-icon>
                              Edit
                            </button>
                          </li>
                          <li role="none">
                            <button class="act-dropdown-item act-dropdown-item-danger" role="menuitem" (click)="deleteActivity($event, activity)">
                              <app-icon name="trash-2" [size]="16" strokeWidth="2" [class]="'act-dropdown-icon'"></app-icon>
                              Delete
                            </button>
                          </li>
                          <li role="none">
                            <button class="act-dropdown-item" role="menuitem" (click)="retrySyncRoute($event, activity)">
                              <app-icon name="rotate-ccw" [size]="16" strokeWidth="2" [class]="'act-dropdown-icon'"></app-icon>
                              Retry sync
                            </button>
                          </li>
                        </ul>
                      }
                    </div>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1 && status() !== 'empty') {
          <nav class="pagination" aria-label="Activities pagination">
            <button class="page-btn" [disabled]="currentPage() <= 1" (click)="goToPage(currentPage() - 1)">
              Previous
            </button>
            @for (p of pageNumbers(); track p) {
              @if (typeof p === 'string') {
                <span class="page-ellipsis">…</span>
              } @else {
                <button
                  class="page-btn page-num"
                  [class.page-active]="p === currentPage()"
                  (click)="goToPage(p)"
                >{{ p }}</button>
              }
            }
            <button class="page-btn" [disabled]="currentPage() >= totalPages()" (click)="goToPage(currentPage() + 1)">
              Next
            </button>
          </nav>
        }
        @if (status() !== 'empty') {
        <div class="page-size-control">
          <span class="filter-label">Per page</span>
          <div class="custom-select page-size-select" tabindex="0" (click)="pageSizeMenuOpen.set(!pageSizeMenuOpen())" (keydown.enter)="pageSizeMenuOpen.set(!pageSizeMenuOpen())" (blur)="pageSizeMenuOpen.set(false)">
            <span class="custom-select-trigger">{{ pageSize() }}<span class="select-arrow">▾</span></span>
            @if (pageSizeMenuOpen()) {
              <ul class="custom-select-options" (mousedown)="$event.preventDefault()">
                @for (size of PAGE_SIZE_OPTIONS; track size) {
                  <li role="option" (click)="onPageSizeChange(size)" [class.active]="pageSize() === size">{{ size }}</li>
                }
              </ul>
            }
          </div>
        </div>
        }

        @if (status() === 'empty') {
          <article class="empty-state empty-state--no-activities" aria-labelledby="activities-empty-title">
            <p class="empty-state-kicker">No activities yet</p>
            <h2 id="activities-empty-title">Sync activities to start building your local history.</h2>
            <p>
              TrailRoam will show imported Strava activities here after the first successful sync.
            </p>
            <p class="privacy-note">Your data stays private — everything is stored locally in your browser.</p>
            <button class="primary-action" type="button" (click)="startSync()">Sync activities</button>
          </article>
        }

        @if (filteredActivities(); as pageItems) {
          @if (pageItems.length === 0 && status() !== 'empty') {
            <div class="empty-state-match-wrapper">
              <article class="empty-state empty-state--no-match" aria-labelledby="activities-empty-match-title">
                <p class="empty-state-kicker">No matching activities</p>
                <h2 id="activities-empty-match-title">
                  @if (sourceFilter().size > 0) {No activities match the selected source filters.}
                  @else {No activities match your filters.}
                </h2>
                <p>Try adjusting your search or filter criteria to find what you're looking for.</p>
              </article>
            </div>
          }
        }


      }
      @if (selectedActivity(); as selActivity) {
        <app-activity-detail-panel
          [activity]="selActivity"
          [route]="selectedRoute()"
          (close)="clearSelectedActivity()"
        />
      }
    </section>
  `,
  styles: [`
    .empty-state-match-wrapper {
      align-items: center;
      display: flex;
      justify-content: center;
      min-height: 200px;
      width: 100%;
    }

    .loading-state {
      align-items: center;
      display: flex;
      justify-content: center;
      min-height: 200px;
      width: 100%;
    }

    .activities-header {
      margin-bottom: 16px;
    }

    .activities-header__title-row {
      align-items: center;
      display: flex;
      gap: 12px;
    }

    .activities-header__title-row h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
      margin: 0;
    }

    .local-storage-indicator {
      align-items: center;
      color: #859b8e;
      display: inline-flex;
      font-size: 0.8125rem;
      gap: 6px;
    }

    .ls-icon {
      color: #63746a;
      flex-shrink: 0;
    }

    .ls-info-icon {
      color: #a0b4a6;
      cursor: help;
      flex-shrink: 0;
    }

    .activities-toolbar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }

    .import-btn {
      align-items: center;
      background: transparent;
      border: 1px solid #cbd8d0;
      border-radius: 8px;
      color: #314b3f;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 6px;
      height: 36px;
      margin-left: auto;
      padding: 0 14px;
      transition: background 120ms ease, border-color 120ms ease;
      white-space: nowrap;
    }

    .import-btn:hover {
      background: #d6e8dc;
      border-color: #b6cdbe;
    }

    .import-drop-overlay {
      align-items: center;
      background: rgb(20 33 27 / 40%);
      display: flex;
      inset: 0;
      justify-content: center;
      position: fixed;
      z-index: 2000;
    }

    .import-drop-card {
      align-items: center;
      background: #ffffff;
      border: 2px dashed #15803d;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 260px;
      justify-content: center;
      max-width: 460px;
      padding: 32px;
      width: 100%;
    }

    .import-drop-title {
      color: #14211b;
      font-size: 1.125rem;
      font-weight: 700;
      margin: 0;
    }

    .import-drop-sub {
      color: #63746a;
      font-size: 0.875rem;
      margin: 0;
    }

    .import-drop-formats {
      color: #859b8e;
      font-size: 0.75rem;
      margin: 4px 0 0;
    }

    .search-field {
      align-items: center;
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      display: flex;
      flex: 1;
      min-width: 200px;
      max-width: 340px;
      min-height: 44px;
      padding: 0 12px;
      position: relative;
    }

    .search-field__icon {
      color: #a0b4a6;
      flex-shrink: 0;
    }

    .search-field__input {
      border: 0;
      color: #14211b;
      font: inherit;
      font-size: 0.875rem;
      outline: none;
      padding: 0 8px;
      width: 100%;
    }

    .search-field__input::placeholder {
      color: #a0b4a6;
    }

    .search-field__clear {
      background: transparent;
      border: 0;
      color: #a0b4a6;
      cursor: pointer;
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1;
      min-height: 24px;
      min-width: 24px;
      padding: 0;
    }

    .search-field__clear:hover {
      color: #63746a;
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

    .drp-backdrop {
      background: transparent;
      left: 0;
      min-height: 100vh;
      position: fixed;
      top: 0;
      width: 100vw;
      z-index: 1000;
    }
    .drp-floating {
      display: flex;
      justify-content: center;
      left: 0;
      padding-top: 80px;
      pointer-events: none;
      position: fixed;
      top: 0;
      width: 100vw;
      z-index: 1001;
    }
    .drp-floating > * {
      pointer-events: auto;
    }

    .stats-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 16px;
    }

    .stat-card {
      align-items: center;
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 12px;
      display: flex;
      gap: 14px;
      min-height: 80px;
      padding: 16px 20px;
    }

    .stat-card__icon {
      align-items: center;
      background: #e6f7ef;
      border-radius: 50%;
      color: #1f6f50;
      display: flex;
      height: 40px;
      justify-content: center;
      width: 40px;
      flex-shrink: 0;
    }

    .stat-card__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .stat-card__value {
      color: #14211b;
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .stat-card__label {
      color: #63746a;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .local-data-notice {
      align-items: flex-start;
      background: #e6f7ef;
      border: 1px solid #a3d4bb;
      border-radius: 10px;
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      padding: 14px 16px;
      position: relative;
    }

    .local-data-notice__icon {
      color: #1f6f50;
      flex-shrink: 0;
    }

    .local-data-notice__content {
      display: flex;
      flex-direction: column;
      font-size: 0.8125rem;
      gap: 2px;
      line-height: 1.5;
      min-width: 0;
      padding-right: 28px;
    }

    .local-data-notice__content strong {
      color: #14412e;
    }

    .local-data-notice__content span {
      color: #36634b;
    }

    .local-data-notice__dismiss {
      align-items: center;
      background: transparent;
      border: 0;
      color: #7cb89a;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      min-height: 28px;
      min-width: 28px;
      padding: 0;
      position: absolute;
      right: 8px;
      top: 8px;
    }

    .local-data-notice__dismiss:hover {
      color: #1f6f50;
    }

    .selected-actions-bar {
      align-items: center;
      background: #eef5f0;
      border: 1px solid #dce6df;
      border-radius: 10px;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      margin-bottom: 0;
      padding: 10px 16px;
      transition: background 0.2s, border-color 0.2s;
    }

    .selected-actions-bar.selected-actions-bar--active {
      background: #1f6f50;
      border-color: #1f6f50;
    }

    .selected-actions-bar__summary {
      align-items: center;
      color: #63746a;
      display: inline-flex;
      font-size: 0.875rem;
      font-weight: 700;
      gap: 8px;
    }

    .selected-actions-bar--active .selected-actions-bar__summary {
      color: #ffffff;
    }

    .selected-actions-bar__check {
      flex-shrink: 0;
    }

    .selected-actions-bar__actions {
      align-items: center;
      display: flex;
      gap: 8px;
    }

    .selected-action {
      align-items: center;
      background: transparent;
      border: 1px solid #cbd8d0;
      border-radius: 8px;
      color: #314b3f;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 6px;
      min-height: 36px;
      padding: 0 14px;
      white-space: nowrap;
    }

    .selected-action:hover {
      background: #d6e8dc;
      border-color: #b6cdbe;
    }

    .selected-actions-bar--active .selected-action {
      background: rgb(255 255 255 / 12%);
      border-color: rgb(255 255 255 / 25%);
      color: #ffffff;
    }

    .selected-actions-bar--active .selected-action:hover {
      background: rgb(255 255 255 / 30%);
      border-color: rgb(255 255 255 / 50%);
    }

    .selected-actions-bar--active .selected-action--secondary:hover {
      background: rgb(255 255 255 / 30%);
      border-color: rgb(255 255 255 / 50%);
    }

    .selected-actions-bar--active .selected-action--danger {
      border-color: rgb(255 255 255 / 35%);
    }

    .selected-actions-bar--active .selected-action--danger:hover {
      background: #8f2d22;
      border-color: #8f2d22;
    }

    .col-checkbox {
      width: 48px;
      text-align: center;
    }

    .col-checkbox input[type="checkbox"] {
      cursor: pointer;
      height: 16px;
      width: 16px;
    }

    .cell-checkbox {
      padding: 4px 8px;
      text-align: center;
      width: 48px;
    }

    .cell-checkbox input[type="checkbox"] {
      cursor: pointer;
      height: 16px;
      width: 16px;
    }

    .row-selected {
      background: #eef9f3 !important;
    }

    .activities-count {
      color: #4f6f5d;
      font-size: 0.8125rem;
      font-weight: 600;
      margin: 0 0 12px;
    }

    .activities-table-wrap {
      border: 1px solid #dce6df;
      border-radius: 8px;
      overflow-x: auto;
    }

    .activities-table {
      border-collapse: collapse;
      font-size: 0.875rem;
      width: 100%;
    }

    .activities-table th {
      background: #eef5f0;
      color: #314b3f;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 10px 14px;
      text-align: left;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .activities-table th.sortable {
      cursor: pointer;
      user-select: none;
    }

    .activities-table th.sortable:hover {
      background: #dce6df;
    }

    .activities-table td {
      border-top: 1px solid #eef5f0;
      padding: 10px 14px;
      vertical-align: middle;
    }

    .activity-row.clickable {
      cursor: pointer;
    }

    .activity-row.clickable:hover {
      background: #e6f7ef;
    }

    .activity-row.no-route {
      cursor: default;
    }

    .activity-row:hover {
      background: #f4f9f6;
    }

    .activity-row.panel-open {
      background: #e6f7ef;
    }

    .activity-row.panel-open:hover {
      background: #d6efe1;
    }

    .focus-highlight {
      animation: focus-pulse 3s ease-out;
    }

    @keyframes focus-pulse {
      0%, 100% { background-color: transparent; box-shadow: inset 3px 0 0 0 transparent; }
      15% { background-color: #d4edda; box-shadow: inset 3px 0 0 0 #1f6f50; }
      85% { background-color: #d4edda; box-shadow: inset 3px 0 0 0 #1f6f50; }
    }

    .cell-date {
      color: #63746a;
      max-width: 110px;
      white-space: nowrap;
    }

    .cell-date-secondary {
      color: #a0b4a6;
      font-size: 0.8125rem;
    }

    .cell-name {
      color: #14211b;
      font-weight: 600;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cell-name-bold {
      font-weight: 700;
    }

    .cell-distance-bold {
      font-weight: 700;
      color: #14211b;
    }

    .cell-num {
      white-space: nowrap;
    }

    .category-tag {
      align-items: center;
      border-radius: 5px;
      display: inline-flex;
      font-size: 0.875rem;
      font-weight: 700;
      gap: 5px;
      padding: 4px 9px;
      white-space: nowrap;
    }

    .cat-emoji {
      font-size: 0.875rem;
      line-height: 1;
    }

    .cat-dot {
      border-radius: 50%;
      display: inline-block;
      height: 8px;
      width: 8px;
    }

    .route-badge {
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 7px;
      white-space: nowrap;
    }

    .route-ok {
      background: #e6f7ef;
      color: #1f6f50;
    }

    .pagination {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-top: 20px;
    }

    .page-size-control {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 12px;
    }

    .page-size-control .filter-label {
      color: #63746a;
      font-size: 0.8125rem;
      font-weight: 600;
    }

    .custom-select {
      cursor: pointer;
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
      font-size: 0.875rem;
      font-weight: 600;
      gap: 8px;
      min-height: 34px;
      min-width: 60px;
      padding: 4px 12px;
    }

    .select-arrow {
      color: #a0b4a6;
      font-size: 0.75rem;
    }

    .custom-select-options {
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

    .custom-select-options li {
      border-radius: 6px;
      cursor: pointer;
      padding: 6px 12px;
      white-space: nowrap;
    }

    .custom-select-options li:hover,
    .custom-select-options li.active {
      background: #eef5f0;
    }

    .page-btn {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #14211b;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      min-height: 34px;
      padding: 6px 14px;
    }

    .page-btn:hover:not(:disabled) {
      background: #eef5f0;
    }

    .page-btn:disabled {
      color: #a0b4a6;
      cursor: default;
    }

    .page-num {
      min-width: 36px;
      padding: 6px 8px;
    }

    .page-active {
      background: #1f6f50;
      border-color: #1f6f50;
      color: #ffffff;
    }

    .page-active:hover:not(:disabled) {
      background: #185940;
      border-color: #185940;
    }

    .page-ellipsis {
      color: #a0b4a6;
      font-size: 0.875rem;
      padding: 0 2px;
    }

    .page-info {
      color: #4f6f5d;
      font-size: 0.8125rem;
    }

    .col-sparkline {
      width: 56px;
      padding: 4px 6px;
    }

    .cell-sparkline {
      padding: 4px 6px;
      text-align: center;
      vertical-align: middle;
      width: 56px;
    }

    .cell-sparkline svg {
      display: block;
      margin: 0 auto;
    }

    .sparkline-loading {
      display: inline-block;
      width: 44px;
      height: 32px;
      background: linear-gradient(90deg, #eef5f0 25%, #dce6df 50%, #eef5f0 75%);
      background-size: 80px 32px;
      border-radius: 3px;
      animation: sparkline-pulse 1.2s ease-in-out infinite;
    }

    @keyframes sparkline-pulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    .col-actions-header {
      width: 80px;
    }

    .cell-actions {
      padding: 4px 8px;
      text-align: center;
      width: 80px;
    }

    .activity-actions-cell {
      align-items: center;
      display: inline-flex;
      gap: 2px;
    }

    .map-nav-btn {
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: #a0b4a6;
      cursor: pointer;
      display: inline-flex;
      justify-content: center;
      min-height: 32px;
      min-width: 32px;
      padding: 0;
    }

    .map-nav-btn:hover {
      background: #eef5f0;
      border-color: #dce6df;
      color: #1f6f50;
    }

    .map-nav-btn svg {
      display: block;
    }

    .activity-menu-wrapper {
      position: relative;
    }

    .activity-menu-trigger {
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
      min-height: 36px;
      min-width: 36px;
      padding: 0;
    }

    .activity-menu-trigger:hover {
      background: #eef5f0;
      border-color: #dce6df;
      color: #14211b;
    }

    .activity-menu-trigger:active {
      background: #dce6df;
    }

    .activity-dropdown {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgb(20 33 27 / 18%);
      list-style: none;
      min-width: 160px;
      padding: 4px;
      z-index: 1000;
    }

    .act-dropdown-item {
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

    .act-dropdown-item:hover {
      background: #eef5f0;
    }

    .act-dropdown-item:active {
      background: #dce6df;
    }

    .act-dropdown-icon {
      color: #a0b4a6;
      flex-shrink: 0;
    }

    .act-dropdown-item:hover .act-dropdown-icon {
      color: #63746a;
    }

    .act-dropdown-item-danger {
      color: #8f2d22;
    }

    .act-dropdown-item-danger:hover {
      background: #fdf0ee;
    }

    .act-dropdown-item-danger .act-dropdown-icon {
      color: #c2817a;
    }

    .act-dropdown-item-disabled {
      color: #a0b4a6;
      cursor: default;
      opacity: 0.6;
    }

    .act-dropdown-item-disabled:hover {
      background: transparent;
    }

    .act-dropdown-item-disabled .act-dropdown-icon {
      color: #cbd6cf;
    }

    .act-dropdown-item-danger:hover .act-dropdown-icon {
      color: #8f2d22;
    }

    @media (max-width: 900px) {
      .stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .stats-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .selected-actions-bar {
        flex-direction: column;
        align-items: stretch;
      }

      .selected-actions-bar__actions {
        flex-wrap: wrap;
      }
    }

    .source-filter-bar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 14px;
      margin-bottom: 10px;
    }

    .source-filter-label {
      color: #63746a;
      font-size: 0.75rem;
      font-weight: 600;
      margin-right: 4px;
    }

    .source-filter-chip {
      align-items: center;
      background: #f4f9f6;
      border: 1px solid transparent;
      border-radius: 20px;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.8125rem;
      gap: 4px;
      height: 30px;
      padding: 0 12px;
      transition: background 120ms ease, border-color 120ms ease;
    }

    .source-filter-chip:hover {
      background: #dce6df;
    }

    .source-filter-chip--active {
      background: #1f6f50;
      border-color: #1f6f50;
      color: #ffffff;
    }

    .source-filter-chip--active:hover {
      background: #185940;
    }

    .source-filter-count {
      background: rgb(0 0 0 / 10%);
      border-radius: 10px;
      font-size: 0.6875rem;
      font-variant-numeric: tabular-nums;
      padding: 0 6px;
    }

    .source-filter-chip--active .source-filter-count {
      background: rgb(255 255 255 / 20%);
    }

    .cell-source {
      font-size: 0.8125rem;
      padding: 0 8px;
      white-space: nowrap;
    }

    .cell-status {
      font-size: 0.8125rem;
      padding: 0 8px;
      white-space: nowrap;
    }

    .source-badge {
      font-weight: 600;
    }

    .source-badge--strava {
      color: #b87a2d;
    }

    .source-badge--imported {
      color: #2d7fb8;
    }

    .status-badge {
      align-items: center;
      border-radius: 4px;
      display: inline-flex;
      font-size: 0.75rem;
      font-weight: 600;
      gap: 3px;
      padding: 2px 6px;
    }

    .status-badge--completed {
      background: #e6f7ef;
      color: #15803d;
    }

    .status-badge--planned {
      background: #f3e8ff;
      color: #7c3aed;
    }


`],
})
export class ActivitiesPageComponent {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly stravaSessionService = inject(StravaSessionService);
  private readonly routeNormalizer = inject(StravaRouteNormalizer);
  private readonly gpxExportService = inject(GpxExportService);
  private readonly confirmService = inject(ConfirmService);
  private readonly dialog = inject(MatDialog);
  private readonly parserService = inject(ActivityParserService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly focusActivityId = toSignal(
    this.activatedRoute.queryParamMap.pipe(map((params) => params.get('focusActivityId'))),
    { initialValue: null },
  );
  protected readonly highlightActivityId = signal<string | null>(null);

  protected readonly status = signal<'loading' | 'empty' | 'loaded'>('loading');
  protected readonly activities = signal<ActivityRecord[] | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly totalCount = signal(0);
  protected readonly PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
  protected readonly pageSize = signal(50);
  protected readonly CATEGORY_COLORS = CATEGORY_COLORS;
  protected readonly SPORT_TYPE_EMOJI = SPORT_TYPE_EMOJI;
  protected readonly legendCategories: ActivityCategory[] = ['ride', 'run', 'walk', 'hike', 'water', 'paddling', 'winter', 'other'];
  protected readonly dragOver = signal(false);

  protected readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly sortColumn = signal<SortColumn>('date');
  protected readonly sortDirection = signal<-1 | 1>(-1);
  protected readonly filterMenuOpen = signal(false);
  protected readonly datePresetOpen = signal(false);
  protected readonly pageSizeMenuOpen = signal(false);
  protected readonly openMenuId = signal<string | null>(null);
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly menuStyle = signal<Record<string, string>>({});
  protected readonly showLocalNotice = signal(true);
  private readonly routesCache = new Map<string, [number, number][]>();
  protected readonly routesCacheFilled = signal(false);
  protected readonly selectedActivity = signal<ActivityRecord | null>(null);
  protected readonly selectedRoute = signal<(ActivityRouteRecord & { coordinates: [number, number][]; elevations?: number[]; cumulativeDistances?: number[] }) | null>(null);

  private async initLocalNotice(): Promise<void> {
    const settings = await this.repositories.settings.get();
    if (settings?.dismissedLocalDataNoticeAt) {
      this.showLocalNotice.set(false);
    }
  }

  protected async dismissLocalNotice(): Promise<void> {
    this.showLocalNotice.set(false);
    const now = new Date().toISOString();
    const existing = await this.repositories.settings.get() ?? { id: 'default', mapProvider: 'openfreemap', createdAt: now, updatedAt: now };
    await this.repositories.settings.put({ ...existing, dismissedLocalDataNoticeAt: now, updatedAt: now });
  }

  private readonly filtersService = inject(FiltersService);

  protected applyDatePreset(preset: DatePreset): void {
    this.filtersService.setDatePreset(preset);
    this.datePresetOpen.set(false);
    if (preset === 'all') {
      this.filtersService.setDateFrom('');
      this.filtersService.setDateTo('');
      this.clearSelection();
      return;
    }
    if (preset === 'custom') {
      const items = this.activities();
      if (items && items.length > 0) {
        const dates = items.map((a) => new Date(a.startDate).getTime()).filter((t) => !isNaN(t));
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates));
          const maxDate = new Date(Math.max(...dates));
          this.filtersService.setDateFrom(minDate.toISOString().slice(0, 10));
          this.filtersService.setDateTo(maxDate.toISOString().slice(0, 10));
        }
      }
      this.clearSelection();
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
    this.clearSelection();
  }
  protected readonly sportTypeFilter = this.filtersService.sportTypeFilter;
  protected readonly datePreset = this.filtersService.datePreset;
  protected readonly dateFrom = this.filtersService.dateFrom;
  protected readonly dateTo = this.filtersService.dateTo;
  protected readonly nameSearch = this.filtersService.nameSearch;
  protected readonly datePresetLabel = this.filtersService.datePresetLabel;
  protected readonly sourceFilter = signal<Set<'strava' | 'imported-completed' | 'imported-planned'>>(new Set());

  protected resetSourceFilter(): void {
    this.sourceFilter.set(new Set());
  }

  protected toggleSourceFilter(value: 'strava' | 'imported-completed' | 'imported-planned'): void {
    const s = this.sourceFilter();
    const next = new Set(s);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    this.sourceFilter.set(next);
  }

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalFilteredCount() / this.pageSize())));

  protected readonly pageNumbers = computed<(number | '…')[]>(() => {
    const total = this.totalPages();
    const cur = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | '…')[] = [];
    pages.push(1);
    if (cur > 3) { pages.push('…'); }
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    for (let i = start; i <= end; i++) { pages.push(i); }
    if (cur < total - 2) { pages.push('…'); }
    pages.push(total);
    return pages;
  });

  protected readonly sportTypeGroups = computed<{ category: ActivityCategory; sportTypes: string[] }[]>(() => {
    const items = this.activities();
    if (!items) { return []; }
    const seen = new Set<string>();
    const groups = new Map<ActivityCategory, Set<string>>();
    for (const a of items) {
      if (seen.has(a.sportType)) { continue; }
      seen.add(a.sportType);
      const cat = mapSportTypeToCategory(a.sportType);
      if (!groups.has(cat)) { groups.set(cat, new Set()); }
      groups.get(cat)!.add(a.sportType);
    }
    const order: ActivityCategory[] = ['ride', 'run', 'walk', 'water', 'paddling', 'winter', 'other'];
    return order
      .filter((cat) => groups.has(cat))
      .map((cat) => ({ category: cat, sportTypes: [...groups.get(cat)!].sort() }));
  });

  protected readonly allFiltered = computed<ActivityRecord[]>(() => {
    const items = this.activities();
    if (!items) { return []; }
    const sportFilter = this.sportTypeFilter();
    const fromDate = this.dateFrom();
    const toDate = this.dateTo();
    const search = this.nameSearch().toLowerCase().trim();
    const srcFilter = this.sourceFilter();
    const filtered = items.filter((a) => {
      if (srcFilter.size > 0) {
        const isStrava = a.provider === 'strava';
        const isPlanned = a.activityStatus === 'planned';
        const matchesAny = (srcFilter.has('strava') && isStrava)
          || (srcFilter.has('imported-completed') && !isStrava && !isPlanned)
          || (srcFilter.has('imported-planned') && isPlanned);
        if (!matchesAny) return false;
      }
      if (sportFilter) {
        if (sportFilter.startsWith('__cat__')) {
          const cat = sportFilter.slice(7) as ActivityCategory;
          if (mapSportTypeToCategory(a.sportType) !== cat) { return false; }
        } else {
          if (a.sportType !== sportFilter) { return false; }
        }
      }
      if (fromDate && a.startDate && !isAfterOrEqual(a.startDate, fromDate)) { return false; }
      if (toDate && a.startDate && !isBeforeOrEqual(a.startDate, toDate)) { return false; }
      if (search && !a.name.toLowerCase().includes(search)) { return false; }
      return true;
    });

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return filtered.sort((a, b) => dir * compareActivities(a, b, col));
  });

  protected readonly filteredActivities = computed<ActivityRecord[] | null>(() => {
    const all = this.allFiltered();
    if (all.length === 0 && this.activities() !== null) { return []; }
    if (all.length === 0) { return null; }
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });

  protected readonly totalFilteredCount = computed(() => this.allFiltered().length);

  protected readonly sourceFilterCounts = computed(() => {
    const items = this.activities();
    if (!items) return { all: 0, strava: 0, importedCompleted: 0, importedPlanned: 0 };
    const all = items.length;
    let strava = 0;
    let importedCompleted = 0;
    let importedPlanned = 0;
    for (const a of items) {
      if (a.provider === 'strava') strava++;
      else if (a.activityStatus === 'planned') importedPlanned++;
      else importedCompleted++;
    }
    return { all, strava, importedCompleted, importedPlanned };
  });

  protected readonly selectionCount = computed(() => this.selectedIds().size);

  protected readonly allPageSelected = computed(() => {
    const page = this.filteredActivities();
    if (!page || page.length === 0) { return false; }
    const ids = this.selectedIds();
    return page.every((a) => ids.has(a.id));
  });

  protected readonly statCount = computed(() => {
    const c = this.allFiltered().length;
    if (c === 0 && this.status() === 'empty') { return '—'; }
    return `${c}`;
  });

  protected readonly statDistance = computed(() => {
    const all = this.allFiltered();
    const totalDistanceMeters = all.reduce((s, a) => s + (a.distanceMeters ?? 0), 0);
    const distanceKm = totalDistanceMeters / 1000;
    if (totalDistanceMeters === 0) { return this.status() === 'empty' ? '—' : '0 km'; }
    return distanceKm >= 100 ? `${distanceKm.toFixed(0)} km` : `${distanceKm.toFixed(1)} km`;
  });

  protected readonly statMovingTime = computed(() => {
    const all = this.allFiltered();
    const totalMovingSeconds = all.reduce((s, a) => s + (a.movingTimeSeconds ?? 0), 0);
    if (totalMovingSeconds === 0) { return this.status() === 'empty' ? '—' : '0h 0m'; }
    return formatDurationHours(totalMovingSeconds);
  });

  protected readonly statAvgSpeed = computed(() => {
    const all = this.allFiltered();
    const activitiesWithSpeed = all.filter((a) => computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds) !== undefined);
    if (activitiesWithSpeed.length === 0) { return '—'; }
    const speedsMs = activitiesWithSpeed.map((a) => computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds)!);
    const avgMs = speedsMs.reduce((s, v) => s + v, 0) / speedsMs.length;
    return `${(avgMs * 3.6).toFixed(1)} km/h`;
  });

  protected readonly summaryText = computed(() => {
    const all = this.allFiltered();
    if (all.length === 0) { return '0 activities'; }

    const count = all.length;

    const totalDistanceMeters = all.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0);
    const distanceKm = totalDistanceMeters / 1000;

    const totalMovingSeconds = all.reduce((sum, a) => sum + (a.movingTimeSeconds ?? 0), 0);

    const activitiesWithSpeed = all.filter((a) => {
      const speed = computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds);
      return speed !== undefined;
    });
    const avgSpeedKmh = (() => {
      if (activitiesWithSpeed.length === 0) { return null; }
      const speedsMs = activitiesWithSpeed.map((a) => computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds)!);
      const avgMs = speedsMs.reduce((s, v) => s + v, 0) / speedsMs.length;
      return avgMs * 3.6;
    })();

    const parts: string[] = [];
    parts.push(`${count} ${count === 1 ? 'activity' : 'activities'}`);

    if (totalDistanceMeters > 0) {
      if (distanceKm >= 100) {
        parts.push(`${distanceKm.toFixed(0)} km`);
      } else {
        parts.push(`${distanceKm.toFixed(2)} km`);
      }
    }

    if (totalMovingSeconds > 0) {
      parts.push(formatDurationHours(totalMovingSeconds));
    }

    if (avgSpeedKmh !== null) {
      parts.push(`${avgSpeedKmh.toFixed(1)} km/h avg`);
    }

    return parts.join(' · ');
  });

  constructor() {
    this.loadPage(1);
    this.initLocalNotice();
    globalThis.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target?.closest('.toolbar-select') && !target?.closest('.drp-overlay')) {
        this.closeAllMenus();
      }
    });
    this.dataRefresh.refresh$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadPage(1));
    effect(() => {
      const focusId = this.focusActivityId();
      const items = this.activities();
      if (focusId && items && this.status() === 'loaded') {
        setTimeout(() => this.handleFocusActivity(focusId), 100);
      }
    });
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.clearSelection();
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  protected toggleSelection(id: string): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  protected toggleSelectAllPage(): void {
    const page = this.filteredActivities();
    if (!page) { return; }
    const allSelected = this.allPageSelected();
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      for (const a of page) {
        if (allSelected) { next.delete(a.id); } else { next.add(a.id); }
      }
      return next;
    });
  }

  protected async downloadSelectedGpx(): Promise<void> {
    const ids = this.selectedIds();
    const all = this.allFiltered();
    const selected = all.filter((a) => ids.has(a.id));
    if (selected.length === 0) { return; }
    const count = await this.gpxExportService.buildZip(new (await import('jszip')).default(), selected);
    if (count.exported === 0) {
      this.toastService.show('No GPS routes available for the selected activities.');
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
    const result = await this.gpxExportService.exportActivitiesAsZip(selected);
    this.clearSelection();
    this.toastService.show(`Downloaded ${result.exported} GPX ${result.exported === 1 ? 'file' : 'files'} as zip.`);
  }

  protected async deleteSelected(): Promise<void> {
    const count = this.selectionCount();
    if (count === 0) { return; }
    const confirmed = await this.confirmService.confirm({
      title: `Delete ${count} selected ${count === 1 ? 'activity' : 'activities'}?`,
      message: `${count} ${count === 1 ? 'activity has' : 'activities have'} been selected for deletion. This will remove all selected activities and their GPS routes from the local database. Strava data is not affected.`,
      confirmLabel: `Delete ${count} ${count === 1 ? 'activity' : 'activities'}`,
      danger: true,
    });
    if (!confirmed) { return; }
    const ids = this.selectedIds();
    await Promise.all([
      ...Array.from(ids).map((id) => this.repositories.activities.delete(id)),
      ...Array.from(ids).map((id) => this.repositories.activityRoutes.delete(id)),
    ]);
    this.activities.update((items) => items?.filter((a) => !ids.has(a.id)) ?? null);
    this.totalCount.update((c) => Math.max(0, c - ids.size));
    this.clearSelection();
    this.toastService.show(`Deleted ${count} ${count === 1 ? 'activity' : 'activities'}.`);
  }

  protected onSportTypeChange(value: string): void {
    this.filtersService.setSportTypeFilter(value);
    this.filterMenuOpen.set(false);
    this.clearSelection();
  }

  protected onCategoryFilterChange(category: ActivityCategory): void {
    this.filtersService.setSportTypeFilter('__cat__' + category);
    this.filterMenuOpen.set(false);
    this.clearSelection();
  }

  protected toggleFilterMenu(): void {
    this.filterMenuOpen.update((v) => !v);
  }

  protected closeFilterMenu(): void {
    this.filterMenuOpen.set(false);
  }

  protected onSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 1 ? -1 : 1);
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(column === 'date' ? -1 : 1);
    }
  }

  protected sortIndicator(column: SortColumn): string {
    if (this.sortColumn() !== column) { return ''; }
    return this.sortDirection() === 1 ? ' ▲' : ' ▼';
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) { return; }
    this.currentPage.set(page);
    this.loadPage(page);
    this.clearSelection();
  }

  protected viewSelectedOnMap(): void {
    const ids = this.selectedIds();
    const all = this.allFiltered();
    const firstWithRoute = all.find((a) => ids.has(a.id) && a.hasRoute);
    if (firstWithRoute) {
      this.router.navigate(['/map'], { queryParams: { activityId: firstWithRoute.id } });
    } else {
      this.toastService.show('None of the selected activities have a route to view on the map.');
    }
  }

  protected navigateToActivity(activity: ActivityRecord): void {
    this.selectedActivity.set(activity);
    if (activity.hasRoute) {
      Promise.all([
        this.repositories.activityRoutes.get(activity.id),
        this.repositories.routeGeometry.get(activity.id),
      ]).then(([route, geometry]) => {
        if (route && geometry) {
          this.selectedRoute.set({ ...route, coordinates: geometry.coordinates, elevations: geometry.elevations, cumulativeDistances: geometry.cumulativeDistances });
        } else if (route) {
          const oldCoords = (route as any).coordinates;
          if (oldCoords && oldCoords.length > 0) {
            this.selectedRoute.set({ ...route, coordinates: oldCoords, elevations: (route as any).elevations, cumulativeDistances: (route as any).cumulativeDistances });
          } else {
            this.selectedRoute.set(null);
          }
        } else {
          this.selectedRoute.set(null);
        }
      });
    } else {
      this.selectedRoute.set(null);
    }
  }

  protected clearSelectedActivity(): void {
    this.selectedActivity.set(null);
    this.selectedRoute.set(null);
  }

  protected navigateToMap(event: MouseEvent, activity: ActivityRecord): void {
    event.stopPropagation();
    this.router.navigate(['/map'], { queryParams: { activityId: activity.id } });
  }

  protected getRouteCoords(activityId: string): [number, number][] | null {
    return this.routesCache.get(activityId) ?? null;
  }

  protected toggleActivityMenu(event: MouseEvent, activityId: string): void {
    event.stopPropagation();
    const opening = this.openMenuId() !== activityId;
    if (opening) {
      const btn = event.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      const menuHeight = 160;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow >= menuHeight) {
        this.menuStyle.set({ position: 'fixed', top: rect.bottom + 'px', right: window.innerWidth - rect.right + 12 + 'px', bottom: 'auto' });
      } else {
        this.menuStyle.set({ position: 'fixed', top: 'auto', right: window.innerWidth - rect.right + 12 + 'px', bottom: window.innerHeight - rect.top + 'px' });
      }
    }
    this.openMenuId.set(opening ? activityId : null);
  }

  protected closeAllMenus(): void {
    this.openMenuId.set(null);
    this.filterMenuOpen.set(false);
    this.datePresetOpen.set(false);
  }

  protected openOnStrava(event: MouseEvent, activity: ActivityRecord): void {
    event.stopPropagation();
    this.openMenuId.set(null);
    const url = `https://www.strava.com/activities/${activity.providerActivityId}`;
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  protected async downloadGpx(event: MouseEvent, activity: ActivityRecord): Promise<void> {
    event.stopPropagation();
    this.openMenuId.set(null);
    const result = await this.gpxExportService.exportActivity(activity);
    if (!result.success) {
      this.toastService.show(result.reason);
    }
  }

  protected async editActivity(event: MouseEvent, activity: ActivityRecord): Promise<void> {
    event.stopPropagation();
    this.openMenuId.set(null);
    const ref = this.dialog.open(EditActivityDialog, {
      data: {
        currentName: activity.name,
        currentSportType: activity.sportType,
        currentActivityStatus: activity.activityStatus ?? 'completed',
      },
      disableClose: true,
    });
    const result = await ref.afterClosed().toPromise();
    if (!result) return;
    if (result.name === activity.name && result.sportType === activity.sportType && result.activityStatus === (activity.activityStatus ?? 'completed')) return;
    await this.repositories.activities.updateMetadata(activity.id, {
      name: result.name,
      sportType: result.sportType,
      activityStatus: result.activityStatus,
    });
    this.dataRefresh.emitRefresh();
  }

  protected async deleteActivity(event: MouseEvent, activity: ActivityRecord): Promise<void> {
    event.stopPropagation();
    this.openMenuId.set(null);
    await Promise.all([
      this.repositories.activities.delete(activity.id),
      this.repositories.activityRoutes.delete(activity.id),
    ]);
    this.activities.update((items) => items?.filter((a) => a.id !== activity.id) ?? null);
    this.totalCount.update((c) => Math.max(0, c - 1));
    this.toastService.show(`"${activity.name}" was deleted from local database.`);
  }

  protected openFilePicker(): void {
    this.fileInput()?.nativeElement?.click();
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.types.includes('Files')) {
      this.dragOver.set(true);
    }
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.relatedTarget as HTMLElement | null;
    if (!target || !target.closest('.import-drop-overlay')) {
      this.dragOver.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.processImportFile(file);
    }
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.processImportFile(file);
    }
    input.value = '';
  }

  private async processImportFile(file: File): Promise<void> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['gpx', 'fit', 'tcx'].includes(ext)) {
      this.toastService.show('Unsupported file type. Please use GPX, FIT or TCX files.');
      return;
    }

    let parsed;
    try {
      parsed = await this.parserService.parseFile(file);
    } catch (err: any) {
      this.toastService.show(err.message || 'Unable to parse the selected activity file.');
      return;
    }

    if (!parsed || parsed.coordinates.length < 2) {
      this.toastService.show('This file contains no usable GPS track.');
      return;
    }

    const allActivities = await this.repositories.activities.list();
    const isDuplicate = this.parserService.computeDuplicates(parsed, allActivities);

    const ref = this.dialog.open(ImportActivityDialog, {
      data: { parsed, fileName: file.name, isDuplicate },
      disableClose: true,
    });

    const result: { name: string; sportType: string; activityStatus: 'completed' | 'planned' } | undefined = await ref.afterClosed().toPromise();
    if (!result) return;

    const id = generateId();
    const now = new Date().toISOString();
    const category = mapSportTypeToCategory(result.sportType);

    const activityRecord: ActivityRecord = {
      id,
      provider: 'local',
      providerActivityId: id,
      name: result.name,
      sportType: result.sportType,
      activityCategory: category,
      startDate: parsed.startTime,
      distanceMeters: parsed.totalDistanceMeters,
      movingTimeSeconds: parsed.movingTimeSeconds,
      elapsedTimeSeconds: parsed.elapsedTimeSeconds,
      totalElevationGainMeters: parsed.totalElevationGainMeters,
      averageSpeedMetersPerSecond: parsed.averageSpeedMetersPerSecond,
      activityStatus: result.activityStatus,
      hasRoute: true,
      routeSyncStatus: 'route_synced',
      importedAt: now,
      updatedAt: now,
    };

    await this.repositories.activities.put(activityRecord);

    const routeRecord: ActivityRouteRecord = {
      activityId: id,
      providerActivityId: id,
      simplifiedCoordinates: parsed.coordinates,
      simplifiedPointCount: parsed.coordinates.length,
      pointCount: parsed.coordinates.length,
      syncedAt: now,
      updatedAt: now,
    };
    await this.repositories.activityRoutes.put(routeRecord);

    const geometryRecord: RouteGeometryRecord = {
      activityId: id,
      providerActivityId: id,
      coordinates: parsed.coordinates,
      elevations: parsed.elevations.length > 0 ? parsed.elevations : undefined,
      cumulativeDistances: parsed.cumulativeDistances,
      syncedAt: now,
      updatedAt: now,
    };
    await this.repositories.routeGeometry.put(geometryRecord);

    this.toastService.show(`"${result.name}" was imported successfully.`);
    this.dataRefresh.emitRefresh();
  }

  protected async retrySyncRoute(event: MouseEvent, activity: ActivityRecord): Promise<void> {
    event.stopPropagation();
    this.openMenuId.set(null);
    const fetchResult = await this.stravaSessionService.fetchActivityRoute(Number(activity.providerActivityId));
    if (fetchResult.success) {
      const normalized = this.routeNormalizer.normalize(activity.id, activity.providerActivityId, fetchResult);
      if (normalized.success) {
        const now = new Date().toISOString();
        await this.repositories.activityRoutes.upsert(normalized.route);
        await this.repositories.activities.updateRouteSyncStatus(activity.id, true, 'route_synced');
        this.activities.update((items) =>
          items?.map((a) => a.id === activity.id ? { ...a, hasRoute: true, routeSyncStatus: 'route_synced' as const, updatedAt: now } : a) ?? null,
        );
        this.toastService.show(`Route synced for "${activity.name}".`);
      } else {
        const status = normalized.errorCode === 'NO_GPS_ROUTE' ? 'no_route' as const : 'route_failed' as const;
        await this.repositories.activities.updateRouteSyncStatus(activity.id, false, status);
        this.activities.update((items) =>
          items?.map((a) => a.id === activity.id ? { ...a, routeSyncStatus: status, updatedAt: new Date().toISOString() } : a) ?? null,
        );
        this.toastService.show(`No GPS route available for "${activity.name}".`);
      }
    } else {
      const status = fetchResult.errorCode === 'NO_GPS_ROUTE' ? 'no_route' as const : 'route_failed' as const;
      await this.repositories.activities.updateRouteSyncStatus(activity.id, false, status);
      this.activities.update((items) =>
        items?.map((a) => a.id === activity.id ? { ...a, routeSyncStatus: status, updatedAt: new Date().toISOString() } : a) ?? null,
      );
      const msg = fetchResult.errorCode === 'STRAVA_LOGIN_REQUIRED' ? 'Log into Strava first to sync routes.' : `No GPS route available for "${activity.name}".`;
      this.toastService.show(msg);
    }
  }

  protected startSync(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected computeSpeed = computeSpeed;
  protected formatDistance = formatDistance;
  protected formatSpeed = formatSpeed;
  protected formatDuration = formatDuration;
  protected formatDurationHours = formatDurationHours;
  protected formatSpeedKmh = formatSpeedKmh;
  protected formatDate = formatDate;
  protected routeStatusLabel = routeStatusLabel;
  protected formatDateInput = formatDateInput;
  protected formatSportType = formatSportType;
  protected formatCategory = formatCategory;
  protected mapSportTypeToCategory = mapSportTypeToCategory;
  protected readonly sportTypeEmoji = sportTypeEmoji;

  protected categoryTagBg = (cat: string): string => {
    const c = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS];
    return c ? c + '22' : '#eef5f0';
  };

  protected categoryTagFg = (cat: string): string => {
    const c = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS];
    return c ?? '#314b3f';
  };
  protected onDateFromChange = (v: string) => { this.filtersService.setDateFrom(v); this.clearSelection(); };
  protected onDateToChange = (v: string) => { this.filtersService.setDateTo(v); this.clearSelection(); };
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
    this.clearSelection();
  }
  private matchPreset(dateFrom: string, dateTo: string): DatePreset {
    if (!dateFrom && !dateTo) return 'all';
    const now = new Date();
    const today = fmtDate(now);
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const sevenAgo = new Date(now); sevenAgo.setDate(sevenAgo.getDate() - 7);
    const thirtyAgo = new Date(now); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
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
  protected onNameSearchChange = (v: string) => { this.filtersService.setNameSearch(v); this.clearSelection(); };

  private async loadPage(page: number): Promise<void> {
    this.status.set('loading');
    try {
      const [items, total] = await Promise.all([
        this.repositories.activities.list(),
        this.repositories.activities.count(),
      ]);

      this.currentPage.set(page);
      this.totalCount.set(total);
      this.activities.set(items);
      this.status.set(items.length === 0 ? 'empty' : 'loaded');

      const routeIds = items.filter((a) => a.hasRoute && !this.routesCache.has(a.id)).map((a) => a.id);
      if (routeIds.length > 0) {
        const routes = await Promise.all(routeIds.map((id) => this.repositories.activityRoutes.get(id)));
        for (const route of routes) {
          if (route) {
            this.routesCache.set(route.activityId, (route as any).simplifiedCoordinates ?? (route as any).coordinates ?? []);
          }
        }
      }
      this.routesCacheFilled.set(true);
    } catch {
      this.status.set('empty');
    }
  }

  private lastFocusedId: string | null = null;

  private handleFocusActivity(focusId: string): void {
    if (focusId === this.lastFocusedId) { return; }
    this.lastFocusedId = focusId;
    const all = this.allFiltered();
    const idx = all.findIndex((a) => a.id === focusId);
    if (idx < 0) { return; }
    const page = Math.floor(idx / this.pageSize()) + 1;
    this.currentPage.set(page);
    this.highlightActivityId.set(focusId);
    const activity = all[idx];
    if (activity) {
      this.navigateToActivity(activity);
    }
    setTimeout(() => {
      const row = document.querySelector(`[data-activity-id="${focusId}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => this.highlightActivityId.set(null), 3000);
  }
}

function compareActivities(a: ActivityRecord, b: ActivityRecord, column: SortColumn): number {
  switch (column) {
    case 'date':
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    case 'name':
      return a.name.localeCompare(b.name);
    case 'source':
      return activitySourceSortValue(a) - activitySourceSortValue(b);
    case 'status':
      return activityStatusSortValue(a) - activityStatusSortValue(b);
    case 'type':
      return a.sportType.localeCompare(b.sportType);
    case 'distance':
      return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
    case 'speed':
      return (computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds) ?? 0) - (computeSpeed(b.averageSpeedMetersPerSecond, b.distanceMeters, b.movingTimeSeconds) ?? 0);
    case 'time':
      return (a.movingTimeSeconds ?? 0) - (b.movingTimeSeconds ?? 0);
    case 'route':
      return routeSortValue(a.routeSyncStatus) - routeSortValue(b.routeSyncStatus);
  }
}

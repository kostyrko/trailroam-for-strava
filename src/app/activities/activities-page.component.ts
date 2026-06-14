import { Component, computed, effect, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const CATEGORY_EMOJI: Record<string, string> = {
  ride: '🚴',
  run: '🏃',
  walk: '🚶',
  hike: '🥾',
  water: '🏊',
  paddling: '🛶',
  winter: '⛷️',
  other: '🏋️',
};
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { FiltersService, CATEGORY_COLORS, isAfterOrEqual, isBeforeOrEqual, type DatePreset } from '../shared/filters.service';
import { ToastService } from '../shared/toast.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { ConfirmService } from '../shared/confirm.service';
import { GpxExportService } from '../shared/gpx-export.service';
import { StravaSessionService } from '../strava/strava-session.service';
import { StravaRouteNormalizer } from '../strava/strava-route-normalizer';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { RouteSparklineComponent } from './route-sparkline.component';
import { ActivityDetailPanelComponent } from './activity-detail-panel.component';
import { type ActivityCategory, type ActivityRecord, type ActivityRouteRecord } from '../storage/storage.models';
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

export type SortColumn = 'date' | 'name' | 'type' | 'distance' | 'speed' | 'time' | 'route';

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
  imports: [LoadingSpinnerComponent, RouteSparklineComponent, ActivityDetailPanelComponent],
  template: `
    <section class="route-page" aria-labelledby="activities-title" [class.route-page--empty]="status() === 'empty'">

      <div class="activities-header">
        <div class="activities-header__title-row">
          <h1 id="activities-title">Activities</h1>
          <div class="local-storage-indicator" title="Activity data is stored locally in this browser">
            <svg class="ls-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Stored locally in this browser</span>
            <svg class="ls-info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
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
            <svg class="local-data-notice__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <div class="local-data-notice__content">
              <strong>All your activity data is stored locally in your browser.</strong>
              <span>No data is sent to any server. Use Sync with Strava to import new activities.</span>
            </div>
            <button class="local-data-notice__dismiss" type="button" (click)="dismissLocalNotice()" aria-label="Dismiss local storage notice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        }

        <div class="activities-toolbar">
          <div class="search-field">
            <svg class="search-field__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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

          @if (datePreset() === 'custom') {
            <div class="custom-date-fields">
              <label class="custom-date-field">
                <span class="custom-date-label">From</span>
                <input
                  class="custom-date-input"
                  type="date"
                  [value]="formatDateInput(dateFrom())"
                  (change)="onDateFromChange($any($event.target).value)"
                />
              </label>
              <label class="custom-date-field">
                <span class="custom-date-label">To</span>
                <input
                  class="custom-date-input"
                  type="date"
                  [value]="formatDateInput(dateTo())"
                  (change)="onDateToChange($any($event.target).value)"
                />
              </label>
            </div>
          }
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--activities">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statCount() }}</span>
              <span class="stat-card__label">Activities</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--route">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statDistance() }}</span>
              <span class="stat-card__label">Total Distance</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--time">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statMovingTime() }}</span>
              <span class="stat-card__label">Total Time</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--speed">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <div class="stat-card__body">
              <span class="stat-card__value">{{ statAvgSpeed() }}</span>
              <span class="stat-card__label">Avg Speed</span>
            </div>
          </div>
        </div>

        <div class="selected-actions-bar" [class.selected-actions-bar--active]="selectionCount() > 0">
            <div class="selected-actions-bar__summary">
              <svg class="selected-actions-bar__check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>{{ selectionCount() === 1 ? '1 activity selected' : selectionCount() + ' activities selected' }}</span>
            </div>
            <div class="selected-actions-bar__actions">
              <button class="selected-action selected-action--secondary" type="button" (click)="downloadSelectedGpx()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download GPX
              </button>
              <button class="selected-action selected-action--danger" type="button" (click)="deleteSelected()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
              <button class="selected-action selected-action--secondary" type="button" (click)="clearSelection()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
        <div class="activities-table-wrap">
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
                <tr class="activity-row" [class.clickable]="activity.hasRoute" [class.no-route]="!activity.hasRoute" [class.focus-highlight]="highlightActivityId() === activity.id" [class.row-selected]="selectedIds().has(activity.id)" [attr.data-activity-id]="activity.id" (click)="navigateToActivity(activity)">
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
                  <td><span class="category-tag" [style.background]="categoryTagBg(activity.activityCategory)" [style.color]="categoryTagFg(activity.activityCategory)"><span class="cat-emoji">{{ sportTypeEmoji(activity.activityCategory) }}</span>{{ formatSportType(activity.sportType) }}</span></td>
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
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
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
                              <svg class="act-dropdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                              Strava
                            </button>
                          </li>
                          <li role="none">
                            <button class="act-dropdown-item" [class.act-dropdown-item-disabled]="!activity.hasRoute" [disabled]="!activity.hasRoute" role="menuitem" (click)="downloadGpx($event, activity)">
                              <svg class="act-dropdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Download GPX
                            </button>
                          </li>
                          <li role="none">
                            <button class="act-dropdown-item act-dropdown-item-danger" role="menuitem" (click)="deleteActivity($event, activity)">
                              <svg class="act-dropdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              Delete
                            </button>
                          </li>
                          <li role="none">
                            <button class="act-dropdown-item" role="menuitem" (click)="retrySyncRoute($event, activity)">
                              <svg class="act-dropdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
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
                <h2 id="activities-empty-match-title">No activities match your filters.</h2>
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

    .custom-date-fields {
      align-items: center;
      display: inline-flex;
      gap: 10px;
    }

    .custom-date-field {
      align-items: center;
      display: flex;
      gap: 6px;
    }

    .custom-date-label {
      color: #63746a;
      font-size: 0.8125rem;
      font-weight: 700;
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
  protected readonly CATEGORY_EMOJI = CATEGORY_EMOJI;
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
  protected readonly selectedRoute = signal<ActivityRouteRecord | null>(null);

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
    const filtered = items.filter((a) => {
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
    globalThis.addEventListener('click', () => this.closeAllMenus());
    this.dataRefresh.refresh$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadPage(this.currentPage()));
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
    if (selected.length > 10) {
      const ok = window.confirm(`Exporting ${selected.length} files — your browser may prompt to allow multiple downloads.`);
      if (!ok) { return; }
    }
    const result = await this.gpxExportService.exportActivitiesAsZip(selected);
    this.clearSelection();
    if (result.exported > 0 && result.skipped > 0) {
      this.toastService.show(`Exported ${result.exported} GPX file(s) as zip, ${result.skipped} skipped (no route).`);
    } else if (result.exported > 0) {
      this.toastService.show(`Exported ${result.exported} GPX file(s) as zip.`);
    } else {
      this.toastService.show('No GPS routes available for the selected activities.');
    }
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
      this.repositories.activityRoutes.get(activity.id).then((route) => {
        this.selectedRoute.set(route ?? null);
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
  protected sportTypeEmoji = (cat: string): string => CATEGORY_EMOJI[cat] ?? '🏋️';

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
            this.routesCache.set(route.activityId, route.coordinates);
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

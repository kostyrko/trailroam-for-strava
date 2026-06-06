import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { FiltersService, CATEGORY_COLORS, isAfterOrEqual, isBeforeOrEqual } from '../shared/filters.service';
import { ToastService } from '../shared/toast.service';
import { GpxExportService } from '../shared/gpx-export.service';
import { StravaSessionService } from '../strava/strava-session.service';
import { StravaRouteNormalizer } from '../strava/strava-route-normalizer';
import { type ActivityCategory, type ActivityRecord } from '../storage/storage.models';
import { formatSportType, mapSportTypeToCategory } from '../strava/activity-category';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

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
  template: `
    <section class="route-page" aria-labelledby="activities-title">
      <h1 id="activities-title">Activities</h1>

      @if (status() === 'loading') {
        <article class="empty-state" aria-label="Loading activities">
          <p class="empty-state-kicker">Loading</p>
          <p>Loading your local activities…</p>
        </article>
      } @else if (status() === 'empty') {
        <article class="empty-state" aria-labelledby="activities-empty-title">
          <p class="empty-state-kicker">No activities yet</p>
          <h2 id="activities-empty-title">Sync activities to start building your local history.</h2>
          <p>
            TrailRoam will show imported Strava activities here after the first successful sync.
          </p>
          <p class="privacy-note">Your data stays private — everything is stored locally in your browser.</p>
          <button class="primary-action" type="button" (click)="startSync()">Sync activities</button>
        </article>
      } @else if (activities(); as items) {
        <div class="activities-filters">
          <div class="filter-row">
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
          </div>
          <div class="filter-row">
            <label class="filter-group">
              <span class="filter-label">From</span>
              <input
                class="filter-input"
                type="date"
                [value]="formatDateInput(dateFrom())"
                (change)="onDateFromChange($any($event.target).value)"
              />
              @if (dateFrom()) {
                <button class="filter-clear" type="button" (click)="onDateFromChange('')">Clear</button>
              }
            </label>
            <label class="filter-group">
              <span class="filter-label">To</span>
              <input
                class="filter-input"
                type="date"
                [value]="formatDateInput(dateTo())"
                (change)="onDateToChange($any($event.target).value)"
              />
              @if (dateTo()) {
                <button class="filter-clear" type="button" (click)="onDateToChange('')">Clear</button>
              }
            </label>
          </div>
        </div>

        <p class="activities-count">
          @if (totalFilteredCount() > pageSize()) {
            Showing page {{ currentPage() }} of {{ totalPages() }} · {{ totalFilteredCount() }} activities
          } @else {
            {{ totalFilteredCount() }} activities
          }
        </p>

        <div class="activities-table-wrap">
          <table class="activities-table" aria-label="Imported activities">
            <thead>
              <tr>
                <th scope="col" class="sortable" (click)="onSort('date')">Date{{ sortIndicator('date') }}</th>
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
                <tr class="activity-row" [class.clickable]="activity.hasRoute" [class.no-route]="!activity.hasRoute" (click)="navigateToActivity(activity)">
                  <td class="cell-date">{{ formatDate(activity.startDate) }}</td>
                  <td class="cell-name">{{ activity.name }}</td>
                  <td><span class="category-tag"><span class="cat-dot" [style.background]="CATEGORY_COLORS[activity.activityCategory]"></span>{{ formatSportType(activity.sportType) }}</span></td>
                  <td class="cell-num">{{ formatDistance(activity.distanceMeters) }}</td>
                  <td class="cell-num">{{ formatSpeed(computeSpeed(activity.averageSpeedMetersPerSecond, activity.distanceMeters, activity.movingTimeSeconds)) }}</td>
                  <td class="cell-num">{{ formatDuration(activity.movingTimeSeconds) }}</td>
                  <td>
                    <span class="route-badge" [class.route-ok]="activity.routeSyncStatus === 'route_synced'"
                      >{{ routeStatusLabel(activity.routeSyncStatus) }}</span>
                  </td>
                  <td class="cell-actions">
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
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <nav class="pagination" aria-label="Activities pagination">
            <button class="page-btn" [disabled]="currentPage() <= 1" (click)="goToPage(currentPage() - 1)">
              Previous
            </button>
            <span class="page-info">Page {{ currentPage() }} of {{ totalPages() }}</span>
            <button class="page-btn" [disabled]="currentPage() >= totalPages()" (click)="goToPage(currentPage() + 1)">
              Next
            </button>
          </nav>
        }
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
    </section>
  `,
  styles: [`
    .activities-count {
      color: #4f6f5d;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .activities-table-wrap {
      border: 1px solid #dce6df;
      border-radius: 8px;
      margin-top: 16px;
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

    .cell-date {
      color: #63746a;
      white-space: nowrap;
    }

    .cell-name {
      color: #14211b;
      font-weight: 600;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cell-num {
      white-space: nowrap;
    }

    .category-tag {
      align-items: center;
      background: #eef5f0;
      border-radius: 4px;
      color: #314b3f;
      display: inline-flex;
      font-size: 0.75rem;
      font-weight: 700;
      gap: 4px;
      padding: 3px 7px;
      text-transform: capitalize;
      white-space: nowrap;
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

    .page-size-select .custom-select-trigger {
      min-height: 32px;
      min-width: 60px;
      padding: 4px 10px;
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

    .page-info {
      color: #4f6f5d;
      font-size: 0.8125rem;
    }

    .col-actions-header {
      width: 56px;
    }

    .cell-actions {
      padding: 4px 8px;
      text-align: center;
      width: 56px;
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


    .activities-filters {
      margin-top: 16px;
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

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .filter-row + .filter-row {
      margin-top: 10px;
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
export class ActivitiesPageComponent {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly stravaSessionService = inject(StravaSessionService);
  private readonly routeNormalizer = inject(StravaRouteNormalizer);
  private readonly gpxExportService = inject(GpxExportService);

  protected readonly status = signal<'loading' | 'empty' | 'loaded'>('loading');
  protected readonly activities = signal<ActivityRecord[] | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly totalCount = signal(0);
  protected readonly PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
  protected readonly pageSize = signal(50);
  protected readonly CATEGORY_COLORS = CATEGORY_COLORS;
  protected readonly sortColumn = signal<SortColumn>('date');
  protected readonly sortDirection = signal<-1 | 1>(-1);
  protected readonly filterMenuOpen = signal(false);
  protected readonly pageSizeMenuOpen = signal(false);
  protected readonly openMenuId = signal<string | null>(null);
  protected readonly menuStyle = signal<Record<string, string>>({});

  private readonly filtersService = inject(FiltersService);
  protected readonly sportTypeFilter = signal<string | null>(null);
  protected readonly dateFrom = this.filtersService.dateFrom;
  protected readonly dateTo = this.filtersService.dateTo;

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalFilteredCount() / this.pageSize())));

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

  constructor() {
    this.loadPage(1);
    globalThis.addEventListener('click', () => this.closeAllMenus());
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

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
  }

  protected navigateToActivity(activity: ActivityRecord): void {
    if (activity.hasRoute) {
      this.router.navigate(['/map'], { queryParams: { activityId: activity.id } });
    }
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
  protected formatDate = formatDate;
  protected routeStatusLabel = routeStatusLabel;
  protected formatDateInput = formatDateInput;
  protected formatSportType = formatSportType;
  protected onDateFromChange = this.filtersService.setDateFrom.bind(this.filtersService);
  protected onDateToChange = this.filtersService.setDateTo.bind(this.filtersService);

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
    } catch {
      this.status.set('empty');
    }
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
      return (a.averageSpeedMetersPerSecond ?? 0) - (b.averageSpeedMetersPerSecond ?? 0);
    case 'time':
      return (a.movingTimeSeconds ?? 0) - (b.movingTimeSeconds ?? 0);
    case 'route':
      return routeSortValue(a.routeSyncStatus) - routeSortValue(b.routeSyncStatus);
  }
}

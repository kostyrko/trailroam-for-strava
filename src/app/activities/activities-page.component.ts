import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { FiltersService, ACTIVITY_CATEGORIES, isAfterOrEqual, isBeforeOrEqual } from '../shared/filters.service';
import type { ActivityRecord } from '../storage/storage.models';

const PAGE_SIZE = 50;

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

export type SortColumn = 'date' | 'name' | 'type' | 'distance' | 'speed' | 'time';

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
      <p class="eyebrow">Activities</p>
      <h1 id="activities-title">Activities</h1>

      @if (status() === 'loading') {
        <article class="empty-state" aria-label="Loading activities">
          <p class="empty-state-kicker">Loading</p>
          <p>Loading your local activities…</p>
        </article>
      } @else if (status() === 'empty') {
        <article class="empty-state" aria-labelledby="activities-empty-title">
          <p class="empty-state-kicker">No activities yet</p>
          <h2 id="activities-empty-title">Sync new activities to start building your local history.</h2>
          <p>
            Trailroam will show imported Strava activities here after the first successful sync.
          </p>
          <button class="primary-action" type="button">Sync new activities</button>
        </article>
      } @else if (activities(); as items) {
        <div class="activities-filters">
          <div class="filter-row">
            <label class="filter-group">
              <span class="filter-label">Activity type</span>
              <select
                class="filter-select"
                [value]="categoryFilter() ?? ''"
                (change)="onCategoryChange($any($event.target).value)"
              >
                <option value="">All types</option>
                @for (cat of ACTIVITY_CATEGORIES; track cat) {
                  <option [value]="cat">{{ cat }}</option>
                }
              </select>
              @if (categoryFilter()) {
                <button class="filter-clear" type="button" (click)="onCategoryChange('')">Clear</button>
              }
            </label>
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

        @if (totalCount() > PAGE_SIZE) {
          <p class="activities-count">Showing {{ filteredActivities()!.length }} of {{ totalCount() }} activities</p>
        } @else if (totalCount() > 0) {
          <p class="activities-count">{{ totalCount() }} activities</p>
        }

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
                <th scope="col">Route</th>
              </tr>
            </thead>
            <tbody>
              @for (activity of filteredActivities(); track activity.id) {
                <tr class="activity-row" [class.clickable]="activity.hasRoute" [class.no-route]="!activity.hasRoute" (click)="navigateToActivity(activity)">
                  <td class="cell-date">{{ formatDate(activity.startDate) }}</td>
                  <td class="cell-name">
                    <span class="preview-trigger"
                      >{{ activity.name }}
                      <span class="preview-popover" role="tooltip">
                        <span class="preview-line">{{ formatDate(activity.startDate) }}</span>
                        <span class="preview-line"><strong>{{ activity.name }}</strong></span>
                        <span class="preview-line">{{ activity.activityCategory }} · {{ formatDistance(activity.distanceMeters) }}</span>
                        <span class="preview-line">Avg speed: {{ formatSpeed(computeSpeed(activity.averageSpeedMetersPerSecond, activity.distanceMeters, activity.movingTimeSeconds)) }}</span>
                        <span class="preview-line">Moving time: {{ formatDuration(activity.movingTimeSeconds) }}</span>
                        <span class="preview-line">Route: {{ routeStatusLabel(activity.routeSyncStatus) }}</span>
                      </span>
                    </span>
                  </td>
                  <td><span class="category-tag">{{ activity.activityCategory }}</span></td>
                  <td class="cell-num">{{ formatDistance(activity.distanceMeters) }}</td>
                  <td class="cell-num">{{ formatSpeed(computeSpeed(activity.averageSpeedMetersPerSecond, activity.distanceMeters, activity.movingTimeSeconds)) }}</td>
                  <td class="cell-num">{{ formatDuration(activity.movingTimeSeconds) }}</td>
                  <td>
                    <span class="route-badge" [class.route-ok]="activity.routeSyncStatus === 'route_synced'"
                      >{{ routeStatusLabel(activity.routeSyncStatus) }}</span>
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
      background: #eef5f0;
      border-radius: 4px;
      color: #314b3f;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 7px;
      text-transform: capitalize;
      white-space: nowrap;
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

    .preview-trigger {
      cursor: default;
      position: relative;
    }

    .preview-popover {
      background: #14211b;
      border-radius: 8px;
      bottom: calc(100% + 8px);
      box-shadow: 0 4px 12px rgb(20 33 27 / 25%);
      color: #ffffff;
      display: none;
      font-size: 0.8125rem;
      font-weight: 400;
      left: 50%;
      line-height: 1.5;
      min-width: 200px;
      padding: 10px 14px;
      position: absolute;
      transform: translateX(-50%);
      white-space: nowrap;
      z-index: 10;
    }

    .preview-trigger:hover .preview-popover {
      display: block;
    }

    .preview-line {
      display: block;
    }

    .preview-line strong {
      color: #ffffff;
    }

    .activities-filters {
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
  `],
})
export class ActivitiesPageComponent {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly router = inject(Router);

  protected readonly status = signal<'loading' | 'empty' | 'loaded'>('loading');
  protected readonly activities = signal<ActivityRecord[] | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly totalCount = signal(0);
  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected readonly ACTIVITY_CATEGORIES = ACTIVITY_CATEGORIES;
  protected readonly sortColumn = signal<SortColumn>('date');
  protected readonly sortDirection = signal<-1 | 1>(-1);

  private readonly filtersService = inject(FiltersService);
  protected readonly categoryFilter = this.filtersService.categoryFilter;
  protected readonly dateFrom = this.filtersService.dateFrom;
  protected readonly dateTo = this.filtersService.dateTo;

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));

  protected readonly filteredActivities = computed<ActivityRecord[] | null>(() => {
    const items = this.activities();
    if (!items) { return null; }
    const catFilter = this.categoryFilter();
    const fromDate = this.dateFrom();
    const toDate = this.dateTo();
    const filtered = items.filter((a) => {
      if (catFilter && a.activityCategory !== catFilter) { return false; }
      if (fromDate && a.startDate && !isAfterOrEqual(a.startDate, fromDate)) { return false; }
      if (toDate && a.startDate && !isBeforeOrEqual(a.startDate, toDate)) { return false; }
      return true;
    });

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return filtered.sort((a, b) => dir * compareActivities(a, b, col));
  });

  constructor() {
    this.loadPage(1);
  }

  protected onCategoryChange(value: string): void {
    this.categoryFilter.set(value === '' ? null : (value as any));
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

  protected computeSpeed = computeSpeed;
  protected formatDistance = formatDistance;
  protected formatSpeed = formatSpeed;
  protected formatDuration = formatDuration;
  protected formatDate = formatDate;
  protected routeStatusLabel = routeStatusLabel;
  protected formatDateInput = formatDateInput;
  protected onDateFromChange = this.filtersService.setDateFrom.bind(this.filtersService);
  protected onDateToChange = this.filtersService.setDateTo.bind(this.filtersService);

  private async loadPage(page: number): Promise<void> {
    this.status.set('loading');
    try {
      const [items, total] = await Promise.all([
        this.repositories.activities.listPage(page, PAGE_SIZE),
        this.repositories.activities.count(),
      ]);

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
      return a.startDate.localeCompare(b.startDate);
    case 'name':
      return a.name.localeCompare(b.name);
    case 'type':
      return a.activityCategory.localeCompare(b.activityCategory);
    case 'distance':
      return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
    case 'speed':
      return (a.averageSpeedMetersPerSecond ?? 0) - (b.averageSpeedMetersPerSecond ?? 0);
    case 'time':
      return (a.movingTimeSeconds ?? 0) - (b.movingTimeSeconds ?? 0);
  }
}

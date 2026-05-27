import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import type { ActivityRecord } from '../storage/storage.models';

const PAGE_SIZE = 50;

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
        @if (totalCount() > PAGE_SIZE) {
          <p class="activities-count">Showing {{ items.length }} of {{ totalCount() }} activities</p>
        } @else if (totalCount() > 0) {
          <p class="activities-count">{{ totalCount() }} activities</p>
        }

        <div class="activities-table-wrap">
          <table class="activities-table" aria-label="Imported activities">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Distance</th>
                <th scope="col">Time</th>
                <th scope="col">Route</th>
              </tr>
            </thead>
            <tbody>
              @for (activity of items; track activity.id) {
                <tr class="activity-row" [class.clickable]="activity.hasRoute" [class.no-route]="!activity.hasRoute" (click)="navigateToActivity(activity)">
                  <td class="cell-date">{{ formatDate(activity.startDate) }}</td>
                  <td class="cell-name">
                    <span class="preview-trigger"
                      >{{ activity.name }}
                      <span class="preview-popover" role="tooltip">
                        <span class="preview-line">{{ formatDate(activity.startDate) }}</span>
                        <span class="preview-line"><strong>{{ activity.name }}</strong></span>
                        <span class="preview-line">{{ activity.activityCategory }} · {{ formatDistance(activity.distanceMeters) }}</span>
                        <span class="preview-line">Moving time: {{ formatDuration(activity.movingTimeSeconds) }}</span>
                        <span class="preview-line">Route: {{ routeStatusLabel(activity.routeSyncStatus) }}</span>
                      </span>
                    </span>
                  </td>
                  <td><span class="category-tag">{{ activity.activityCategory }}</span></td>
                  <td class="cell-num">{{ formatDistance(activity.distanceMeters) }}</td>
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

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));

  constructor() {
    this.loadPage(1);
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

  protected formatDistance = formatDistance;
  protected formatDuration = formatDuration;
  protected formatDate = formatDate;
  protected routeStatusLabel = routeStatusLabel;

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

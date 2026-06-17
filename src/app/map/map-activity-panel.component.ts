import {
  Component,
  input,
  Output,
  EventEmitter,
  computed,
  signal,
} from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import { type MapRouteFeature } from './mock-routes';
import { mapSportTypeToCategory } from '../shared/activity-category';

const CATEGORY_EMOJI: Record<string, string> = {
  ride: '🚴',
  run: '🏃',
  walk: '🚶',
  hike: '🥾',
  water: '🏊',
  paddling: '🛶',
  winter: '⛷️',
  winter_sport: '⛷️',
  mountaineering: '🧗',
  other: '🏋️',
};

function sportTypeEmoji(sportType: string): string {
  const category = mapSportTypeToCategory(sportType);
  return CATEGORY_EMOJI[category] ?? CATEGORY_EMOJI['other'];
}

function formatDuration(movingTimeSeconds: number | undefined): string {
  if (!movingTimeSeconds || movingTimeSeconds === 0) { return '—'; }
  const h = Math.floor(movingTimeSeconds / 3600);
  const m = Math.floor((movingTimeSeconds % 3600) / 60);
  if (h > 0) { return `${h}h ${m}m`; }
  return `${m}m`;
}

function formatDistanceKm(meters: number | undefined): string {
  if (!meters || meters === 0) { return '—'; }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isThisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
}

export type PanelSort = 'newest' | 'longest' | 'az';

@Component({
  selector: 'app-map-activity-panel',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="map-panel" [class.map-panel--collapsed]="!panelExpanded()" [class.map-panel--fullscreen]="isFullscreen()">
      <div class="map-panel-side" [class.map-panel-side--hidden]="panelExpanded()">
        <button class="map-panel-handle" type="button" (click)="toggle()" [attr.aria-label]="panelExpanded() ? 'Collapse activities panel' : 'Expand activities panel'" title="Activities">
          <app-icon name="activity" [size]="25" strokeWidth="2"></app-icon>
          @if (!panelExpanded()) {
            <span class="panel-handle-count">{{ totalRoutes() }}</span>
          }
        </button>
      </div>

      <div class="map-panel-inner">
        <div class="panel-header">
          <h2 class="panel-title">
            Activities
            <span class="panel-count">({{ filteredActivities().length }})</span>
          </h2>
          <button class="panel-collapse-btn" type="button" (click)="toggle()" aria-label="Collapse panel">
            <app-icon name="x" [size]="16" strokeWidth="2"></app-icon>
          </button>
        </div>

        <div class="panel-controls">
          <div class="panel-search-wrap">
            <app-icon name="search" [size]="14" strokeWidth="2" [class]="'panel-search-icon'"></app-icon>
            <input
              class="panel-search-input"
              type="search"
              placeholder="Search activities..."
              [value]="searchQuery()"
              (input)="onSearchInput($any($event.target).value)"
              aria-label="Search activities"
            />
            @if (searchQuery()) {
              <button class="panel-search-clear" type="button" (click)="clearSearch()" aria-label="Clear search">
                <app-icon name="x" [size]="12" strokeWidth="2"></app-icon>
              </button>
            }
          </div>

          <label class="panel-visibility-toggle">
            <input type="checkbox" [checked]="visibleOnMap()" (change)="toggleVisibleOnMap()" />
            <span class="panel-toggle-label">Visible on map</span>
          </label>

          <div class="panel-sort-row">
            <button
              class="panel-sort-btn"
              [class.active]="sortBy() === 'newest'"
              type="button"
              (click)="setSort('newest')"
            >Newest</button>
            <button
              class="panel-sort-btn"
              [class.active]="sortBy() === 'longest'"
              type="button"
              (click)="setSort('longest')"
            >Longest</button>
            <button
              class="panel-sort-btn"
              [class.active]="sortBy() === 'az'"
              type="button"
              (click)="setSort('az')"
            >A-Z</button>
          </div>
        </div>

        <div class="panel-list">
          @if (filteredActivities().length === 0) {
            <div class="panel-empty">
              <p>No matching activities</p>
              <p class="panel-empty-hint">Try changing filters or zooming the map.</p>
            </div>
          }
          @for (route of filteredActivities(); track route.activityId) {
            <button
              class="panel-item"
              [class.panel-item--selected]="route.activityId === selectedActivityId()"
              [class.panel-item--hovered]="route.activityId === hoveredActivityId()"
              type="button"
              (click)="selectActivity(route)"
              (mouseenter)="hoverActivity(route)"
              (mouseleave)="unhoverActivity()"
            >
              <span class="panel-item-emoji">{{ sportTypeEmoji(route.activity.sportType) }}</span>
              <div class="panel-item-body">
                <div class="panel-item-name">{{ route.activity.name }}</div>
                <div class="panel-item-meta">
                  {{ formatDistanceKm(route.activity.distanceMeters) }} &middot; {{ formatDuration(route.activity.movingTimeSeconds) }}
                </div>
              </div>
              <div class="panel-item-date">{{ formatDateShort(route.activity.startDate) }}</div>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .map-panel {
      bottom: 0;
      display: flex;
      left: 0;
      pointer-events: none;
      position: absolute;
      top: 0;
      z-index: 100;
    }

    .map-panel.map-panel--fullscreen {
      z-index: 1001;
    }

    .map-panel-side {
      pointer-events: auto;
      position: relative;
      width: 0;
    }

    .map-panel-side--hidden {
      display: none;
    }

    .map-panel-handle {
      align-items: center;
      background: #ffffff;
      border: 2px solid #1f6f50;
      border-left: 0;
      border-radius: 0 6px 6px 0;
      box-shadow: 0 2px 6px rgb(20 33 27 / 18%);
      color: #1f6f50;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      height: 60px;
      justify-content: center;
      left: 0;
      margin-top: 0;
      padding: 0;
      position: absolute;
      top: 12px;
      width: 75px;
      z-index: 200;
    }

    .map-panel-handle:hover {
      background: #e6f7ef;
    }

    .panel-handle-count {
      background: #1f6f50;
      border-radius: 999px;
      color: #ffffff;
      font-size: 0.625rem;
      font-weight: 800;
      line-height: 1;
      min-width: 18px;
      padding: 2px 4px;
      text-align: center;
    }

    .map-panel-inner {
      background: #ffffff;
      border-right: 1px solid #dce6df;
      display: flex;
      flex-direction: column;
      height: 100%;
      pointer-events: auto;
      position: relative;
      transform: translateX(0);
      transition: transform 250ms ease;
      width: 340px;
      z-index: 1;
    }

    .map-panel--collapsed .map-panel-inner {
      transform: translateX(-100%);
      pointer-events: none;
    }

    .panel-header {
      align-items: center;
      border-bottom: 1px solid #eef5f0;
      display: flex;
      flex-shrink: 0;
      gap: 8px;
      min-height: 52px;
      padding: 0 12px 0 16px;
    }

    .panel-title {
      flex: 1;
      font-size: 1rem;
      font-weight: 700;
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-count {
      color: #63746a;
      font-weight: 600;
    }

    .panel-collapse-btn {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: #63746a;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      height: 32px;
      justify-content: center;
      width: 32px;
    }

    .panel-collapse-btn:hover {
      background: #eef5f0;
      color: #14211b;
    }

    .panel-controls {
      border-bottom: 1px solid #eef5f0;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      gap: 6px;
      padding: 10px 12px;
    }

    .panel-search-wrap {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #dce6df;
      border-radius: 8px;
      display: flex;
      gap: 8px;
      height: 36px;
      padding: 0 8px;
      position: relative;
      width: 100%;
    }

    .panel-search-wrap:focus-within {
      border-color: #1f6f50;
      box-shadow: 0 0 0 2px rgb(31 111 80 / 12%);
    }

    .panel-search-icon {
      color: #a0b4a6;
      flex-shrink: 0;
    }

    .panel-search-input {
      background: transparent;
      border: 0;
      color: #14211b;
      flex: 1;
      font: inherit;
      font-size: 0.8125rem;
      min-width: 0;
      outline: 0;
      padding: 0;
    }

    .panel-search-input::placeholder {
      color: #a0b4a6;
    }

    .panel-search-clear {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: #a0b4a6;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      height: 20px;
      justify-content: center;
      width: 20px;
    }

    .panel-search-clear:hover {
      background: #eef5f0;
      color: #63746a;
    }

    .panel-visibility-toggle {
      align-items: center;
      cursor: pointer;
      display: flex;
      gap: 8px;
      user-select: none;
    }

    .panel-visibility-toggle input[type="checkbox"] {
      accent-color: #1f6f50;
      cursor: pointer;
      flex-shrink: 0;
      height: 16px;
      width: 16px;
    }

    .panel-toggle-label {
      color: #314b3f;
      font-size: 0.8125rem;
      font-weight: 600;
    }

    .panel-sort-row {
      display: flex;
      gap: 4px;
    }

    .panel-sort-btn {
      background: transparent;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #63746a;
      cursor: pointer;
      flex: 1;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      min-height: 30px;
      padding: 0 8px;
      text-align: center;
      transition: all 120ms ease;
    }

    .panel-sort-btn:hover {
      background: #eef5f0;
      color: #314b3f;
    }

    .panel-sort-btn.active {
      background: #e6f7ef;
      border-color: #1f6f50;
      color: #1f6f50;
    }

    .panel-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 4px 0;
    }

    .panel-empty {
      align-items: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 40px 16px;
      text-align: center;
    }

    .panel-empty p {
      color: #63746a;
      font-size: 0.875rem;
      font-weight: 600;
      margin: 0;
    }

    .panel-empty-hint {
      color: #a0b4a6;
      font-weight: 400;
    }

    .panel-item {
      align-items: center;
      background: transparent;
      border: 0;
      border-bottom: 1px solid #f0f5f2;
      cursor: pointer;
      display: flex;
      font: inherit;
      gap: 8px;
      min-height: 56px;
      padding: 8px 12px;
      text-align: left;
      width: 100%;
    }

    .panel-item:hover,
    .panel-item--hovered {
      background: #f0f8f3;
    }

    .panel-item--selected {
      background: #e6f7ef;
      border-left: 4px solid #1f6f50;
      font-weight: 700;
      position: relative;
    }

    .panel-item--selected .panel-item-name {
      font-weight: 700;
    }

    .panel-item-emoji {
      flex-shrink: 0;
      font-size: 1.25rem;
      line-height: 1;
      width: 28px;
      text-align: center;
    }

    .panel-item-body {
      flex: 1;
      min-width: 0;
    }

    .panel-item-name {
      color: #14211b;
      font-size: 0.8125rem;
      font-weight: 700;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-item-meta {
      color: #63746a;
      font-size: 0.6875rem;
      font-weight: 500;
      line-height: 1.3;
      margin-top: 2px;
    }

    .panel-item-date {
      color: #859b8e;
      flex-shrink: 0;
      font-size: 0.6875rem;
      font-weight: 500;
      white-space: nowrap;
    }
  `],
})
export class MapActivityPanelComponent {
  readonly routes = input<MapRouteFeature[]>([]);
  readonly totalRoutes = input(0);
  readonly selectedActivityId = input<string | null>(null);
  readonly hoveredActivityId = input<string | null>(null);
  readonly viewBounds = input<[[number, number], [number, number]] | null>(null);
  readonly isFullscreen = input(false);
  readonly panelExpanded = input(true);

  @Output() selectRoute = new EventEmitter<MapRouteFeature>();
  @Output() hoverRoute = new EventEmitter<MapRouteFeature | null>();
  @Output() visibleOnMapChange = new EventEmitter<boolean>();
  @Output() panelExpandedChange = new EventEmitter<boolean>();

  protected readonly searchQuery = signal('');
  protected readonly visibleOnMap = signal(false);
  protected readonly sortBy = signal<PanelSort>('newest');
  private searchInputTimeout: ReturnType<typeof setTimeout> | null = null;

  private routeIntersectsBounds(route: MapRouteFeature, bounds: [[number, number], [number, number]]): boolean {
    const [sw, ne] = bounds;
    return route.coordinates.some(([lng, lat]) => lng >= sw[0] && lng <= ne[0] && lat >= sw[1] && lat <= ne[1]);
  }

  protected readonly filteredActivities = computed(() => {
    let list = this.routes();
    const bounds = this.viewBounds();
    if (this.visibleOnMap() && bounds) {
      list = list.filter((r) => this.routeIntersectsBounds(r, bounds));
    }
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(
        (r) =>
          r.activity.name.toLowerCase().includes(query) ||
          r.activity.sportType.toLowerCase().includes(query),
      );
    }
    const sort = this.sortBy();
    if (sort === 'newest') {
      list = [...list].sort(
        (a, b) => new Date(b.activity.startDate).getTime() - new Date(a.activity.startDate).getTime(),
      );
    } else if (sort === 'longest') {
      list = [...list].sort((a, b) => (b.activity.distanceMeters ?? 0) - (a.activity.distanceMeters ?? 0));
    } else if (sort === 'az') {
      list = [...list].sort((a, b) => a.activity.name.localeCompare(b.activity.name));
    }
    return list;
  });

  protected toggle(): void {
    this.panelExpandedChange.emit(!this.panelExpanded());
  }

  protected onSearchInput(value: string): void {
    if (this.searchInputTimeout) {
      clearTimeout(this.searchInputTimeout);
    }
    this.searchInputTimeout = setTimeout(() => {
      this.searchQuery.set(value);
    }, 150);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected toggleVisibleOnMap(): void {
    const next = !this.visibleOnMap();
    this.visibleOnMap.set(next);
    this.visibleOnMapChange.emit(next);
  }

  protected setSort(sort: PanelSort): void {
    this.sortBy.set(sort);
  }

  protected selectActivity(route: MapRouteFeature): void {
    this.selectRoute.emit(route);
  }

  protected hoverActivity(route: MapRouteFeature): void {
    this.hoverRoute.emit(route);
  }

  protected unhoverActivity(): void {
    this.hoverRoute.emit(null);
  }

  protected readonly formatDistanceKm = formatDistanceKm;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDateShort = formatDateShort;
  protected readonly sportTypeEmoji = sportTypeEmoji;
}

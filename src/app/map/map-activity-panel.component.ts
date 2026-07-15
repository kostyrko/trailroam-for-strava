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
import { formatDistance, formatDuration, formatDateShort } from '../shared/formatters';
import { sportTypeEmojiFromString } from '../shared/activity-display';


export type PanelSort = 'newest' | 'longest' | 'az';

@Component({
  selector: 'app-map-activity-panel',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './map-activity-panel.component.html',
  styleUrl: './map-activity-panel.component.scss',
})
export class MapActivityPanelComponent {
  readonly routes = input<MapRouteFeature[]>([]);
  readonly totalRoutes = input(0);
  readonly selectedActivityId = input<string | null>(null);
  readonly hoveredActivityId = input<string | null>(null);
  readonly viewBounds = input<[[number, number], [number, number]] | null>(null);
  readonly isFullscreen = input(false);
  readonly panelExpanded = input(true);
  readonly noTransition = input(false);

  @Output() selectRoute = new EventEmitter<MapRouteFeature>();
  @Output() hoverRoute = new EventEmitter<MapRouteFeature | null>();
  @Output() visibleOnMapChange = new EventEmitter<boolean>();
  @Output() panelExpandedChange = new EventEmitter<boolean>();
  @Output() downloadPanelGpx = new EventEmitter<MapRouteFeature[]>();
  @Output() sourceFilterChange = new EventEmitter<Set<'strava' | 'imported' | 'planned'>>();

  protected readonly searchQuery = signal('');
  protected readonly visibleOnMap = signal(false);
  protected readonly sortBy = signal<PanelSort>('newest');
  protected readonly sourceFilter = signal<Set<'strava' | 'imported' | 'planned'>>(new Set());
  protected readonly filtersExpanded = signal(localStorage.getItem('trailroam_map_filters_expanded') !== 'false');
  private searchInputTimeout: ReturnType<typeof setTimeout> | null = null;

  private routeIntersectsBounds(route: MapRouteFeature, bounds: [[number, number], [number, number]]): boolean {
    const [sw, ne] = bounds;
    return route.coordinates.some(([lng, lat]) => lng >= sw[0] && lng <= ne[0] && lat >= sw[1] && lat <= ne[1]);
  }

  protected readonly filteredActivities = computed(() => {
    let list = this.routes();
    const srcFilter = this.sourceFilter();
    if (srcFilter.size > 0) {
      list = list.filter((r) => {
        const isStrava = r.activity.provider === 'strava';
        const isPlanned = r.activity.activityStatus === 'planned';
        return (srcFilter.has('strava') && isStrava)
          || (srcFilter.has('imported') && !isStrava && !isPlanned)
          || (srcFilter.has('planned') && isPlanned);
      });
    }
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

  public resetSourceFilter(): void {
    this.sourceFilter.set(new Set());
    this.sourceFilterChange.emit(new Set());
  }

  protected toggleSourceFilter(value: 'strava' | 'imported' | 'planned'): void {
    const s = this.sourceFilter();
    const next = new Set(s);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    this.sourceFilter.set(next);
    this.sourceFilterChange.emit(next);
  }

  protected toggleFiltersExpanded(): void {
    const next = !this.filtersExpanded();
    this.filtersExpanded.set(next);
    localStorage.setItem('trailroam_map_filters_expanded', String(next));
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

  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDateShort = formatDateShort;
  protected readonly sportTypeEmojiFromString = sportTypeEmojiFromString;
}

import {
  Component,
  computed,
  effect,
  inject,
  signal,
  DestroyRef,
  ElementRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivityParserService } from '../shared/activity-parser.service';
import { ImportActivityDialog } from '../shared/import-activity-dialog.component';
import { EditActivityDialog } from '../shared/edit-activity-dialog.component';
import { generateId } from '../shared/uuid';

import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import {
  FiltersService,
  CATEGORY_COLORS,
  isAfterOrEqual,
  isBeforeOrEqual,
  type DatePreset,
} from '../shared/filters.service';
import {
  formatDistance,
  formatElevation,
  computeSpeed,
  formatSpeedKmh,
  formatSpeed,
  formatHeartrate,
  formatDurationHours,
  formatDuration,
  formatDate,
  formatDateShort,
  formatDateInput,
  fmtDate,
} from '../shared/formatters';
import { ToastService } from '../shared/toast.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { ConfirmService } from '../shared/confirm.service';
import { MatDialog } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon.component';
import { GpxExportService } from '../shared/gpx-export.service';
import { StravaSessionService } from '../strava/strava-session.service';
import { StravaRouteNormalizer } from '../strava/strava-route-normalizer';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { ActivitiesToolbarComponent } from './activities-toolbar.component';
import { ActivitiesStatsComponent } from './activities-stats.component';
import { ActivitiesSourceFilterComponent } from './activities-source-filter.component';
import { ActivitiesSelectedActionsComponent } from './activities-selected-actions.component';
import { RouteSparklineComponent } from './route-sparkline.component';
import { ActivityDetailPanelComponent } from './activity-detail-panel.component';
import {
  type ActivityCategory,
  type ActivityRecord,
  type ActivityRouteRecord,
  type RouteGeometryRecord,
  type SavedPlaceRecord,
  type TrailRecord,
} from '../storage/storage.models';
import {
  formatSportType,
  formatCategory,
  mapSportTypeToCategory,
} from '../shared/activity-category';
import { SPORT_TYPE_EMOJI, sportTypeEmoji } from '../shared/activity-display';
import { SavedPlacesService } from '../map/saved-places.service';
import { SavePlaceDialog, type SavePlaceDialogData } from '../shared/save-place-dialog.component';
import { LogbookNavComponent, type LogbookNavItem } from './logbook-nav.component';
import { TrailsService } from '../storage/trails.service';
import { MapLibreService } from '../map/maplibre.service';
import { BasemapProviderService, AVAILABLE_PROVIDERS } from '../map/basemap-provider.service';
import type { BasemapProviderConfig } from '../map/basemap-provider';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

/** A single row in the merged "All" tab. */
export type AllLogbookRow =
  | { kind: 'activity'; activity: ActivityRecord; ts: number }
  | { kind: 'place'; place: SavedPlaceRecord; ts: number };

/**
 * A single row in the Activities tab, which can be a standalone activity or a collapsed Trail
 * containing multiple activities. Trail rows are rendered with expand/collapse, aggregation
 * stats, and a visual badge.
 */
export type VisibleLogbookRow =
  | { kind: 'activity'; activity: ActivityRecord }
  | {
      kind: 'trail';
      trail: TrailRecord;
      /** Filtered activities that belong to this trail (visible when expanded). */
      memberActivities: ActivityRecord[];
      /** Total distance of all member activities in metres. */
      totalDistanceMeters: number;
      /** Total moving time of all member activities in seconds. */
      totalMovingSeconds: number;
      /** Earliest start date among member activities. */
      firstDate: string;
      /** Latest start date among member activities. */
      lastDate: string;
      /** Sort key: timestamp of the first activity. */
      ts: number;
    };

export interface TrailStats {
  totalDistanceMeters: number;
  totalMovingSeconds: number;
  totalElevationGainMeters: number;
  activityCount: number;
  firstDate: string;
  lastDate: string;
}

/**
 * A pre-grouped display unit for the template — either a trail group (header + children)
 * or a single standalone activity row.
 */
export type DisplayGroup =
  | {
      kind: 'trail-group';
      trailRow: VisibleLogbookRow & { kind: 'trail' };
      childActivities: ActivityRecord[];
    }
  | {
      kind: 'single';
      activity: ActivityRecord;
    };

export type SortColumn =
  | 'date'
  | 'name'
  | 'source'
  | 'status'
  | 'type'
  | 'distance'
  | 'speed'
  | 'time'
  | 'route';

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
    case 'route_synced':
      return 0;
    case 'no_route':
      return 1;
    case 'empty_route':
      return 2;
    case 'route_failed':
      return 3;
    case 'invalid_coordinates':
      return 4;
    case 'skipped':
      return 5;
    case 'fetching':
      return 6;
    default:
      return 7;
  }
}

function routeStatusLabel(status: string): string {
  switch (status) {
    case 'route_synced':
      return 'Route';
    case 'no_route':
      return 'No route';
    case 'empty_route':
      return 'Empty route';
    case 'route_failed':
      return 'Failed';
    case 'invalid_coordinates':
      return 'Invalid coords';
    case 'skipped':
      return 'Skipped';
    case 'fetching':
      return 'Fetching…';
    default:
      return '—';
  }
}

@Component({
  selector: 'app-activities-page',
  imports: [
    LoadingSpinnerComponent,
    RouteSparklineComponent,
    ActivityDetailPanelComponent,
    IconComponent,
    ActivitiesToolbarComponent,
    ActivitiesStatsComponent,
    ActivitiesSourceFilterComponent,
    ActivitiesSelectedActionsComponent,
    LogbookNavComponent,
  ],
  templateUrl: './activities-page.component.html',
  styleUrl: './activities-page.component.scss',
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
  protected readonly trailsService = inject(TrailsService);
  private readonly mapLibreService = inject(MapLibreService);
  private readonly basemapProviderService = inject(BasemapProviderService);

  /** Tabbed view state for the Logbook page. */
  protected readonly logbookView = signal<string>('activities');
  protected readonly savedPlacesService = inject(SavedPlacesService);

  /** Data-driven nav items for the Logbook tab switcher. */
  protected readonly logbookNavItems = computed<LogbookNavItem[]>(() => [
    {
      id: 'activities',
      label: 'Activities',
      icon: 'activity',
      count: this.totalCount(),
    },
    {
      id: 'places',
      label: 'Places',
      icon: 'map-pin',
      count: this.savedPlacesService.places().length,
    },
    {
      id: 'all',
      label: 'All',
      icon: 'layers',
      count: this.totalCount() + this.savedPlacesService.places().length,
    },
  ]);

  /** Trail expand/collapse session state. */
  protected readonly expandedTrailIds = signal<Set<string>>(new Set());
  protected readonly selectedTrail = signal<TrailRecord | null>(null);

  /* ── Mini map for trail detail panel ──────────── */

  private readonly trailMiniMapContainer =
    viewChild<ElementRef<HTMLDivElement>>('trailMiniMapContainer');
  private trailMapInstance: MapLibreMap | null = null;
  private readonly trailMapReady = signal(false);
  protected readonly trailMapExpanded = signal(false);
  protected readonly trailSpeedLegend = signal(false);
  protected readonly trailLayerMenuOpen = signal(false);
  protected readonly trailActiveLayerId = signal('openfreemap');
  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;

  /**
   * Set of all activity IDs that belong to any trail. These activities are hidden behind
   * their trail container and only visible when the trail is expanded.
   */
  protected readonly trailedActivityIds = computed<Set<string>>(() => {
    return this.trailsService.allTrailedActivityIds();
  });

  /** Number of active trails (groups with 2+ activities). */
  protected readonly trailCount = computed(() => this.trailsService.trails().length);

  /** Whether at least one trail exists. */
  protected readonly hasTrails = computed(() => this.trailCount() > 0);

  /**
   * Returns the trail stats for a given trail by computing across its member activities.
   */
  protected getTrailStats(trail: TrailRecord): TrailStats {
    const all = this.activities();
    const members = trail.activityIds
      .map((id) => all?.find((a) => a.id === id))
      .filter((a): a is ActivityRecord => a !== undefined);
    return {
      totalDistanceMeters: members.reduce((s, a) => s + (a.distanceMeters ?? 0), 0),
      totalMovingSeconds: members.reduce((s, a) => s + (a.movingTimeSeconds ?? 0), 0),
      totalElevationGainMeters: members.reduce((s, a) => s + (a.totalElevationGainMeters ?? 0), 0),
      activityCount: members.length,
      firstDate:
        members.length > 0
          ? members.reduce(
              (earliest, a) => (a.startDate < earliest ? a.startDate : earliest),
              members[0].startDate,
            )
          : '',
      lastDate:
        members.length > 0
          ? members.reduce(
              (latest, a) => (a.startDate > latest ? a.startDate : latest),
              members[0].startDate,
            )
          : '',
    };
  }

  /**
   * Visible rows for the Activities tab: a mix of Trail containers and standalone activities.
   * Activities belonging to a trail are hidden behind the trail row unless expanded.
   */
  protected readonly visibleRows = computed<VisibleLogbookRow[]>(() => {
    const all = this.activities();
    const trails = this.trailsService.trails();
    const trailedIds = this.trailedActivityIds();
    const expanded = this.expandedTrailIds();

    if (!all) return [];

    // Build a lookup: activityId → trail
    const trailByActivity = new Map<string, TrailRecord>();
    for (const trail of trails) {
      for (const aid of trail.activityIds) {
        trailByActivity.set(aid, trail);
      }
    }

    // Separate activities into trailed (grouped by trail) and standalone
    const trailActivities = new Map<string, ActivityRecord[]>();
    const standalone: ActivityRecord[] = [];

    for (const activity of all) {
      const trail = trailByActivity.get(activity.id);
      if (trail) {
        let members = trailActivities.get(trail.id);
        if (!members) {
          members = [];
          trailActivities.set(trail.id, members);
        }
        members.push(activity);
      } else {
        standalone.push(activity);
      }
    }

    // Build top-level items: trail rows + standalone activities (no child rows yet)
    const topLevel: {
      kind: 'trail' | 'activity';
      data: VisibleLogbookRow;
      ts: number;
    }[] = [];

    for (const trail of trails) {
      const members = trailActivities.get(trail.id);
      if (!members || members.length < 2) continue; // skip invalid trails

      const totalDistanceMeters = members.reduce((s, a) => s + (a.distanceMeters ?? 0), 0);
      const totalMovingSeconds = members.reduce((s, a) => s + (a.movingTimeSeconds ?? 0), 0);
      const dates = members.map((a) => a.startDate).sort();
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];

      // Sort members according to the current sort column
      const col = this.sortColumn();
      const sorted = [...members].sort(
        (a, b) => this.sortDirection() * compareActivities(a, b, col),
      );

      topLevel.push({
        kind: 'trail',
        ts: new Date(firstDate).getTime(),
        data: {
          kind: 'trail',
          trail,
          memberActivities: sorted,
          totalDistanceMeters,
          totalMovingSeconds,
          firstDate,
          lastDate,
          ts: new Date(firstDate).getTime(),
        },
      });
    }

    // Add standalone activities
    for (const act of standalone) {
      topLevel.push({
        kind: 'activity',
        ts: new Date(act.startDate).getTime(),
        data: { kind: 'activity', activity: act },
      });
    }

    // Sort top-level items (trail rows + standalone activities) by the selected column
    const col = this.sortColumn();
    const dir = this.sortDirection();
    topLevel.sort((a, b) => {
      const valA = rowSortValue(a, col);
      const valB = rowSortValue(b, col);
      if (typeof valA === 'string') {
        return dir * (valA as string).localeCompare(valB as string);
      }
      return dir * ((valA as number) - (valB as number));
    });

    // Build final rows: insert expanded children directly below their parent trail
    const rows: VisibleLogbookRow[] = [];
    for (const item of topLevel) {
      rows.push(item.data);
      // If this is an expanded trail row, insert its children immediately below
      if (item.kind === 'trail') {
        const trailData = item.data as Extract<VisibleLogbookRow, { kind: 'trail' }>;
        if (expanded.has(trailData.trail.id)) {
          for (const child of trailData.memberActivities) {
            rows.push({ kind: 'activity', activity: child });
          }
        }
      }
    }

    return rows;
  });

  /** Apply sport/date/name/source filters on the visible rows (used for pagination). */
  protected readonly filteredVisibleRows = computed<VisibleLogbookRow[]>(() => {
    const rows = this.visibleRows();
    const sportFilter = this.sportTypeFilter();
    const fromDate = this.dateFrom();
    const toDate = this.dateTo();
    const search = this.nameSearch().toLowerCase().trim();
    const srcFilter = this.sourceFilter();

    return rows.filter((row) => {
      if (row.kind === 'trail') {
        // A trail is visible if any member activity passes the filter
        const members = row.memberActivities;
        return members.some((a) =>
          this.activityPassesFilter(a, sportFilter, fromDate, toDate, search, srcFilter),
        );
      }
      return this.activityPassesFilter(
        row.activity,
        sportFilter,
        fromDate,
        toDate,
        search,
        srcFilter,
      );
    });
  });

  /** Helper: checks if an activity passes the current filter criteria. */
  private activityPassesFilter(
    a: ActivityRecord,
    sportFilter: string | null,
    fromDate: string | null,
    toDate: string | null,
    search: string,
    srcFilter: Set<string>,
  ): boolean {
    if (srcFilter.size > 0) {
      const isStrava = a.provider === 'strava';
      const isPlanned = a.activityStatus === 'planned';
      const matchesAny =
        (srcFilter.has('strava') && isStrava) ||
        (srcFilter.has('imported-completed') && !isStrava && !isPlanned) ||
        (srcFilter.has('imported-planned') && isPlanned);
      if (!matchesAny) return false;
    }
    if (sportFilter) {
      if (sportFilter === '__trails__') {
        if (!this.trailedActivityIds().has(a.id)) return false;
      } else if (sportFilter.startsWith('__cat__')) {
        const cat = sportFilter.slice(7) as ActivityCategory;
        if (mapSportTypeToCategory(a.sportType) !== cat) return false;
      } else {
        if (a.sportType !== sportFilter) return false;
      }
    }
    if (fromDate && a.startDate && !isAfterOrEqual(a.startDate, fromDate)) return false;
    if (toDate && a.startDate && !isBeforeOrEqual(a.startDate, toDate)) return false;
    if (search && !a.name.toLowerCase().includes(search)) return false;
    return true;
  }

  /** Paginated slice of filtered visible rows for the current page. */
  protected readonly pagedRows = computed<VisibleLogbookRow[]>(() => {
    const all = this.filteredVisibleRows();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });

  /** Paginated slice of filtered places for the current page. */
  protected readonly pagedPlaces = computed(() => {
    const all = this.filteredPlaces();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });

  /** Paginated slice of all rows for the current page. */
  protected readonly pagedAllRows = computed(() => {
    const all = this.allRows();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });

  /** Total filtered visible row count (for pagination). */
  protected readonly totalFilteredRowCount = computed(() => this.filteredVisibleRows().length);

  /**
   * Groups the paginated rows into trail-group containers and standalone rows,
   * so the template can wrap each trail group in a distinct <tbody>.
   */
  protected readonly groupedRows = computed<DisplayGroup[]>(() => {
    const rows = this.pagedRows();
    const groups: DisplayGroup[] = [];

    for (const row of rows) {
      if (row.kind === 'trail') {
        groups.push({
          kind: 'trail-group',
          trailRow: row,
          childActivities: [...row.memberActivities],
        });
      } else if (!this.trailedActivityIds().has(row.activity.id)) {
        groups.push({ kind: 'single', activity: row.activity });
      }
    }

    return groups;
  });

  /** Returns the 1-based index of an activity within its parent trail. */
  protected childActivityIndex(trailId: string, activityId: string): number {
    const trail = this.trailsService.trails().find((t) => t.id === trailId);
    if (!trail) return 0;
    return trail.activityIds.indexOf(activityId) + 1;
  }

  /** Search query for the Places tab. */
  protected readonly placesSearchQuery = signal('');
  /** Sort state for the Places tab table. */
  protected readonly placesSortColumn = signal<'date' | 'name'>('date');
  protected readonly placesSortDirection = signal<-1 | 1>(-1);

  /** Filtered and sorted places for the Places tab. */
  protected readonly filteredPlaces = computed<SavedPlaceRecord[]>(() => {
    const query = this.placesSearchQuery().toLowerCase().trim();
    const places = this.savedPlacesService.places();
    const filtered = query
      ? places.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            (p.secondaryLabel?.toLowerCase().includes(query) ?? false),
        )
      : places;
    const col = this.placesSortColumn();
    const dir = this.placesSortDirection();
    return [...filtered].sort((a, b) => {
      const cmp =
        col === 'name'
          ? a.name.localeCompare(b.name)
          : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return dir * cmp;
    });
  });

  protected onPlacesSort(column: 'date' | 'name'): void {
    if (this.placesSortColumn() === column) {
      this.placesSortDirection.set(this.placesSortDirection() === 1 ? -1 : 1);
    } else {
      this.placesSortColumn.set(column);
      this.placesSortDirection.set(column === 'date' ? -1 : 1);
    }
  }

  protected placesSortIndicator(column: 'date' | 'name'): string {
    if (this.placesSortColumn() !== column) {
      return '';
    }
    return this.placesSortDirection() === 1 ? ' ▲' : ' ▼';
  }

  /** Sort state for the All tab table. */
  protected readonly allSortColumn = signal<'date' | 'name'>('date');
  protected readonly allSortDirection = signal<-1 | 1>(-1);

  /** Merged, date-sorted rows for the All tab. */
  protected readonly allRows = computed<AllLogbookRow[]>(() => {
    const activities = this.allFiltered();
    const places = this.savedPlacesService.places();
    const activityRows = activities.map((a) => ({
      kind: 'activity' as const,
      activity: a,
      ts: new Date(a.startDate).getTime(),
    }));
    const placeRows = places.map((p) => ({
      kind: 'place' as const,
      place: p,
      ts: new Date(p.createdAt).getTime(),
    }));
    const merged = [...activityRows, ...placeRows];
    const col = this.allSortColumn();
    const dir = this.allSortDirection();
    return merged.sort((a, b) => {
      if (col === 'date') {
        return dir * (a.ts - b.ts);
      }
      const nameA = a.kind === 'activity' ? a.activity.name : a.place.name;
      const nameB = b.kind === 'activity' ? b.activity.name : b.place.name;
      return dir * nameA.localeCompare(nameB);
    });
  });

  protected onAllSort(column: 'date' | 'name'): void {
    if (this.allSortColumn() === column) {
      this.allSortDirection.set(this.allSortDirection() === 1 ? -1 : 1);
    } else {
      this.allSortColumn.set(column);
      this.allSortDirection.set(column === 'date' ? -1 : 1);
    }
  }

  protected allSortIndicator(column: 'date' | 'name'): string {
    if (this.allSortColumn() !== column) {
      return '';
    }
    return this.allSortDirection() === 1 ? ' ▲' : ' ▼';
  }

  private readonly focusActivityId = toSignal(
    this.activatedRoute.queryParamMap.pipe(map((params) => params.get('focusActivityId'))),
    { initialValue: null },
  );
  private readonly trailIdParam = toSignal(
    this.activatedRoute.queryParamMap.pipe(map((params) => params.get('trailId'))),
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
  protected readonly legendCategories: ActivityCategory[] = [
    'ride',
    'run',
    'walk',
    'hike',
    'water',
    'paddling',
    'winter',
    'other',
  ];
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
  protected readonly selectedRoute = signal<
    | (ActivityRouteRecord & {
        coordinates: [number, number][];
        elevations?: number[];
        cumulativeDistances?: number[];
      })
    | null
  >(null);
  /** Tracks the activity detail panel expanded state for the logbook view. */
  protected readonly activityDetailExpanded = signal(false);

  private async initLocalNotice(): Promise<void> {
    const settings = await this.repositories.settings.get();
    if (settings?.dismissedLocalDataNoticeAt) {
      this.showLocalNotice.set(false);
    }
  }

  protected async dismissLocalNotice(): Promise<void> {
    this.showLocalNotice.set(false);
    const now = new Date().toISOString();
    const existing = (await this.repositories.settings.get()) ?? {
      id: 'default',
      mapProvider: 'openfreemap',
      createdAt: now,
      updatedAt: now,
    };
    await this.repositories.settings.put({
      ...existing,
      dismissedLocalDataNoticeAt: now,
      updatedAt: now,
    });
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
  protected readonly sourceFilter = signal<
    Set<'strava' | 'imported-completed' | 'imported-planned'>
  >(new Set());
  protected readonly sourceFilterExpanded = signal(
    localStorage.getItem('trailroam_activities_source_filter_expanded') !== 'false',
  );

  protected clearAllFilters(): void {
    this.filtersService.clearAll();
    this.resetSourceFilter();
  }

  protected resetSourceFilter(): void {
    this.sourceFilter.set(new Set());
  }

  protected toggleSourceFilterExpanded(): void {
    this.sourceFilterExpanded.update((v) => !v);
    localStorage.setItem(
      'trailroam_activities_source_filter_expanded',
      String(this.sourceFilterExpanded()),
    );
  }

  protected toggleSourceFilter(value: 'strava' | 'imported-completed' | 'imported-planned'): void {
    const s = this.sourceFilter();
    const next = new Set(s);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    this.sourceFilter.set(next);
  }

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalFilteredCount() / this.pageSize())),
  );

  protected readonly pageNumbers = computed<(number | '…')[]>(() => {
    const total = this.totalPages();
    const cur = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | '…')[] = [];
    pages.push(1);
    if (cur > 3) {
      pages.push('…');
    }
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (cur < total - 2) {
      pages.push('…');
    }
    pages.push(total);
    return pages;
  });

  protected readonly sportTypeGroups = computed<
    { category: ActivityCategory; sportTypes: string[] }[]
  >(() => {
    const items = this.activities();
    if (!items) {
      return [];
    }
    const seen = new Set<string>();
    const groups = new Map<ActivityCategory, Set<string>>();
    for (const a of items) {
      if (seen.has(a.sportType)) {
        continue;
      }
      seen.add(a.sportType);
      const cat = mapSportTypeToCategory(a.sportType);
      if (!groups.has(cat)) {
        groups.set(cat, new Set());
      }
      groups.get(cat)!.add(a.sportType);
    }
    const order: ActivityCategory[] = [
      'ride',
      'run',
      'walk',
      'water',
      'paddling',
      'winter',
      'other',
    ];
    return order
      .filter((cat) => groups.has(cat))
      .map((cat) => ({ category: cat, sportTypes: [...groups.get(cat)!].sort() }));
  });

  protected readonly allFiltered = computed<ActivityRecord[]>(() => {
    const items = this.activities();
    if (!items) {
      return [];
    }
    const sportFilter = this.sportTypeFilter();
    const fromDate = this.dateFrom();
    const toDate = this.dateTo();
    const search = this.nameSearch().toLowerCase().trim();
    const srcFilter = this.sourceFilter();
    const filtered = items.filter((a) => {
      if (srcFilter.size > 0) {
        const isStrava = a.provider === 'strava';
        const isPlanned = a.activityStatus === 'planned';
        const matchesAny =
          (srcFilter.has('strava') && isStrava) ||
          (srcFilter.has('imported-completed') && !isStrava && !isPlanned) ||
          (srcFilter.has('imported-planned') && isPlanned);
        if (!matchesAny) return false;
      }
      if (sportFilter) {
        if (sportFilter === '__trails__') {
          if (!this.trailedActivityIds().has(a.id)) {
            return false;
          }
        } else if (sportFilter.startsWith('__cat__')) {
          const cat = sportFilter.slice(7) as ActivityCategory;
          if (mapSportTypeToCategory(a.sportType) !== cat) {
            return false;
          }
        } else {
          if (a.sportType !== sportFilter) {
            return false;
          }
        }
      }
      if (fromDate && a.startDate && !isAfterOrEqual(a.startDate, fromDate)) {
        return false;
      }
      if (toDate && a.startDate && !isBeforeOrEqual(a.startDate, toDate)) {
        return false;
      }
      if (search && !a.name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return filtered.sort((a, b) => dir * compareActivities(a, b, col));
  });

  protected readonly filteredActivities = computed<ActivityRecord[] | null>(() => {
    const all = this.allFiltered();
    if (all.length === 0 && this.activities() !== null) {
      return [];
    }
    if (all.length === 0) {
      return null;
    }
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
    if (!page || page.length === 0) {
      return false;
    }
    const ids = this.selectedIds();
    return page.every((a) => ids.has(a.id));
  });

  protected readonly statCount = computed(() => {
    const c = this.allFiltered().length;
    if (c === 0 && this.status() === 'empty') {
      return '—';
    }
    return `${c}`;
  });

  protected readonly statDistance = computed(() => {
    const all = this.allFiltered();
    const totalDistanceMeters = all.reduce((s, a) => s + (a.distanceMeters ?? 0), 0);
    const distanceKm = totalDistanceMeters / 1000;
    if (totalDistanceMeters === 0) {
      return this.status() === 'empty' ? '—' : '0 km';
    }
    return distanceKm >= 100 ? `${distanceKm.toFixed(0)} km` : `${distanceKm.toFixed(1)} km`;
  });

  protected readonly statMovingTime = computed(() => {
    const all = this.allFiltered();
    const totalMovingSeconds = all.reduce((s, a) => s + (a.movingTimeSeconds ?? 0), 0);
    if (totalMovingSeconds === 0) {
      return this.status() === 'empty' ? '—' : '0h 0m';
    }
    return formatDurationHours(totalMovingSeconds);
  });

  protected readonly statAvgSpeed = computed(() => {
    const all = this.allFiltered();
    const activitiesWithSpeed = all.filter(
      (a) =>
        computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds) !==
        undefined,
    );
    if (activitiesWithSpeed.length === 0) {
      return '—';
    }
    const speedsMs = activitiesWithSpeed.map(
      (a) => computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds)!,
    );
    const avgMs = speedsMs.reduce((s, v) => s + v, 0) / speedsMs.length;
    return `${(avgMs * 3.6).toFixed(1)} km/h`;
  });

  protected readonly summaryText = computed(() => {
    const all = this.allFiltered();
    if (all.length === 0) {
      return '0 activities';
    }

    const count = all.length;

    const totalDistanceMeters = all.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0);
    const distanceKm = totalDistanceMeters / 1000;

    const totalMovingSeconds = all.reduce((sum, a) => sum + (a.movingTimeSeconds ?? 0), 0);

    const activitiesWithSpeed = all.filter((a) => {
      const speed = computeSpeed(
        a.averageSpeedMetersPerSecond,
        a.distanceMeters,
        a.movingTimeSeconds,
      );
      return speed !== undefined;
    });
    const avgSpeedKmh = (() => {
      if (activitiesWithSpeed.length === 0) {
        return null;
      }
      const speedsMs = activitiesWithSpeed.map(
        (a) => computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds)!,
      );
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
    this.savedPlacesService.load();
    void this.trailsService.load();
    globalThis.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target?.closest('.toolbar-select') && !target?.closest('.drp-overlay')) {
        this.closeAllMenus();
      }
      if (!target?.closest('.tdp-layer-menu') && !target?.closest('.tdp-minimap__btn')) {
        this.trailLayerMenuOpen.set(false);
      }
    });
    this.dataRefresh.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadPage(1));
    effect(() => {
      const focusId = this.focusActivityId();
      const items = this.activities();
      if (focusId && items && this.status() === 'loaded') {
        setTimeout(() => this.handleFocusActivity(focusId), 100);
      }
    });
    effect(() => {
      const trailId = this.trailIdParam();
      const trails = this.trailsService.trails();
      if (trailId && trails.length > 0) {
        const trail = trails.find((t) => t.id === trailId);
        if (trail && this.selectedTrail()?.id !== trailId) {
          this.onSelectTrail(trail);
        }
      }
    });

    /* ── Trail mini map lifecycle ──────────────── */
    effect(() => {
      const trail = this.selectedTrail();
      const ready = this.trailMapReady();

      if (trail && !ready) {
        // Container just appeared in DOM; wait for Angular to render it
        setTimeout(() => this.initTrailMiniMap(), 0);
      }

      if (ready && this.trailMapInstance) {
        this.renderTrailMiniMapRoutes();
      }
    });

    // Clean up map when trail panel closes
    effect(() => {
      if (!this.selectedTrail() && this.trailMapReady()) {
        this.destroyTrailMiniMap();
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected toggleSelectAllPage(): void {
    const page = this.filteredActivities();
    if (!page) {
      return;
    }
    const allSelected = this.allPageSelected();
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      for (const a of page) {
        if (allSelected) {
          next.delete(a.id);
        } else {
          next.add(a.id);
        }
      }
      return next;
    });
  }

  protected async downloadSelectedGpx(): Promise<void> {
    const ids = this.selectedIds();
    const all = this.allFiltered();
    const selected = all.filter((a) => ids.has(a.id));
    if (selected.length === 0) {
      return;
    }
    const count = await this.gpxExportService.buildZip(
      new (await import('jszip')).default(),
      selected,
    );
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
      if (!confirmed) {
        return;
      }
    }
    const result = await this.gpxExportService.exportActivitiesAsZip(selected);
    this.clearSelection();
    this.toastService.show(
      `Downloaded ${result.exported} GPX ${result.exported === 1 ? 'file' : 'files'} as zip.`,
    );
  }

  protected async deleteSelected(): Promise<void> {
    const count = this.selectionCount();
    if (count === 0) {
      return;
    }
    const confirmed = await this.confirmService.confirm({
      title: `Delete ${count} selected ${count === 1 ? 'activity' : 'activities'}?`,
      message: `${count} ${count === 1 ? 'activity has' : 'activities have'} been selected for deletion. This will remove all selected activities and their GPS routes from the local database. Strava data is not affected.`,
      confirmLabel: `Delete ${count} ${count === 1 ? 'activity' : 'activities'}`,
      danger: true,
    });
    if (!confirmed) {
      return;
    }
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
    if (this.sortColumn() !== column) {
      return '';
    }
    return this.sortDirection() === 1 ? ' ▲' : ' ▼';
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) {
      return;
    }
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
    // Sync expanded state from the trail panel when activity is opened from a trail.
    this.activityDetailExpanded.set(!!this.selectedTrail() && this.trailMapExpanded());
    if (activity.hasRoute) {
      Promise.all([
        this.repositories.activityRoutes.get(activity.id),
        this.repositories.routeGeometry.get(activity.id),
      ]).then(([route, geometry]) => {
        if (route && geometry) {
          this.selectedRoute.set({
            ...route,
            coordinates: geometry.coordinates,
            elevations: geometry.elevations,
            cumulativeDistances: geometry.cumulativeDistances,
          });
        } else if (route) {
          const oldCoords = (route as any).coordinates;
          if (oldCoords && oldCoords.length > 0) {
            this.selectedRoute.set({
              ...route,
              coordinates: oldCoords,
              elevations: (route as any).elevations,
              cumulativeDistances: (route as any).cumulativeDistances,
            });
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
        this.menuStyle.set({
          position: 'fixed',
          top: rect.bottom + 'px',
          right: window.innerWidth - rect.right + 12 + 'px',
          bottom: 'auto',
        });
      } else {
        this.menuStyle.set({
          position: 'fixed',
          top: 'auto',
          right: window.innerWidth - rect.right + 12 + 'px',
          bottom: window.innerHeight - rect.top + 'px',
        });
      }
    }
    this.openMenuId.set(opening ? activityId : null);
  }

  protected togglePlaceMenu(event: MouseEvent, placeId: string): void {
    event.stopPropagation();
    const opening = this.openMenuId() !== placeId;
    if (opening) {
      const btn = event.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      const menuHeight = 160;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow >= menuHeight) {
        this.menuStyle.set({
          position: 'fixed',
          top: rect.bottom + 'px',
          right: window.innerWidth - rect.right + 12 + 'px',
          bottom: 'auto',
        });
      } else {
        this.menuStyle.set({
          position: 'fixed',
          top: 'auto',
          right: window.innerWidth - rect.right + 12 + 'px',
          bottom: window.innerHeight - rect.top + 'px',
        });
      }
    }
    this.openMenuId.set(opening ? placeId : null);
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
    if (
      result.name === activity.name &&
      result.sportType === activity.sportType &&
      result.activityStatus === (activity.activityStatus ?? 'completed')
    )
      return;
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

  protected onSelectPlace(place: SavedPlaceRecord, source: 'places' | 'all' = 'places'): void {
    this.router.navigate(['/map'], { queryParams: { placeId: place.id, from: source } });
  }

  protected async onEditPlace(place: SavedPlaceRecord): Promise<void> {
    const data: SavePlaceDialogData = {
      mode: 'edit',
      suggestedName: place.name,
      suggestedNotes: place.notes,
      secondaryLabel: place.secondaryLabel,
    };
    const ref = this.dialog.open(SavePlaceDialog, { data, disableClose: true });
    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) {
      return;
    }
    try {
      await this.savedPlacesService.update(place.id, {
        name: confirmed.name,
        notes: confirmed.notes,
      });
    } catch {
      this.toastService.show('Could not update place. Please try again.');
    }
  }

  protected async onRemovePlace(place: SavedPlaceRecord): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Remove saved place?',
      message: `This will remove "${place.name}" from your saved places.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.savedPlacesService.remove(place.id);
    } catch {
      this.toastService.show('Could not remove place. Please try again.');
    }
  }

  protected showImportOverlay(): void {
    this.dragOver.set(true);
  }

  protected dismissImportOverlay(): void {
    this.dragOver.set(false);
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

    const result:
      | { name: string; sportType: string; activityStatus: 'completed' | 'planned' }
      | undefined = await ref.afterClosed().toPromise();
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
    this.focusRowAndHighlight(id);
  }

  private focusRowAndHighlight(rowId: string): void {
    const all = this.allFiltered();
    const idx = all.findIndex((a) => a.id === rowId);
    if (idx < 0) {
      return;
    }
    const page = Math.floor(idx / this.pageSize()) + 1;
    this.currentPage.set(page);
    this.highlightActivityId.set(rowId);
    setTimeout(() => {
      const row = document.querySelector(`[data-activity-id="${rowId}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => this.highlightActivityId.set(null), 3000);
  }

  protected async retrySyncRoute(event: MouseEvent, activity: ActivityRecord): Promise<void> {
    event.stopPropagation();
    this.openMenuId.set(null);
    const fetchResult = await this.stravaSessionService.fetchActivityRoute(
      Number(activity.providerActivityId),
    );
    if (fetchResult.success) {
      const normalized = this.routeNormalizer.normalize(
        activity.id,
        activity.providerActivityId,
        fetchResult,
      );
      if (normalized.success) {
        const now = new Date().toISOString();
        await this.repositories.activityRoutes.upsert(normalized.route);
        await this.repositories.activities.updateRouteSyncStatus(activity.id, true, 'route_synced');
        this.activities.update(
          (items) =>
            items?.map((a) =>
              a.id === activity.id
                ? { ...a, hasRoute: true, routeSyncStatus: 'route_synced' as const, updatedAt: now }
                : a,
            ) ?? null,
        );
        this.toastService.show(`Route synced for "${activity.name}".`);
      } else {
        const status =
          normalized.errorCode === 'NO_GPS_ROUTE'
            ? ('no_route' as const)
            : ('route_failed' as const);
        await this.repositories.activities.updateRouteSyncStatus(activity.id, false, status);
        this.activities.update(
          (items) =>
            items?.map((a) =>
              a.id === activity.id
                ? { ...a, routeSyncStatus: status, updatedAt: new Date().toISOString() }
                : a,
            ) ?? null,
        );
        this.toastService.show(`No GPS route available for "${activity.name}".`);
      }
    } else {
      const status =
        fetchResult.errorCode === 'NO_GPS_ROUTE'
          ? ('no_route' as const)
          : ('route_failed' as const);
      await this.repositories.activities.updateRouteSyncStatus(activity.id, false, status);
      this.activities.update(
        (items) =>
          items?.map((a) =>
            a.id === activity.id
              ? { ...a, routeSyncStatus: status, updatedAt: new Date().toISOString() }
              : a,
          ) ?? null,
      );
      const msg =
        fetchResult.errorCode === 'STRAVA_LOGIN_REQUIRED'
          ? 'Log into Strava first to sync routes.'
          : `No GPS route available for "${activity.name}".`;
      this.toastService.show(msg);
    }
  }

  protected startSync(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected readonly computeSpeed = computeSpeed;
  protected readonly formatDistance = formatDistance;
  protected readonly formatSpeed = formatSpeed;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDurationHours = formatDurationHours;
  protected readonly formatSpeedKmh = formatSpeedKmh;
  protected readonly formatDate = formatDate;
  protected readonly formatDateShort = formatDateShort;
  protected readonly formatElevation = formatElevation;
  protected readonly routeStatusLabel = routeStatusLabel;
  protected readonly formatDateInput = formatDateInput;
  protected readonly formatSportType = formatSportType;
  protected readonly formatCategory = formatCategory;
  protected readonly mapSportTypeToCategory = mapSportTypeToCategory;
  protected readonly sportTypeEmoji = sportTypeEmoji;

  protected categoryTagBg = (cat: string): string => {
    const c = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS];
    return c ? c + '22' : '#eef5f0';
  };

  protected categoryTagFg = (cat: string): string => {
    const c = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS];
    return c ?? '#314b3f';
  };
  protected onDateFromChange = (v: string) => {
    this.filtersService.setDateFrom(v);
    this.clearSelection();
  };
  protected onDateToChange = (v: string) => {
    this.filtersService.setDateTo(v);
    this.clearSelection();
  };
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
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenAgo = new Date(now);
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
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
  protected onNameSearchChange = (v: string) => {
    this.filtersService.setNameSearch(v);
    this.clearSelection();
  };

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

      const routeIds = items
        .filter((a) => a.hasRoute && !this.routesCache.has(a.id))
        .map((a) => a.id);
      if (routeIds.length > 0) {
        const routes = await Promise.all(
          routeIds.map((id) => this.repositories.activityRoutes.get(id)),
        );
        for (const route of routes) {
          if (route) {
            this.routesCache.set(
              route.activityId,
              (route as any).simplifiedCoordinates ?? (route as any).coordinates ?? [],
            );
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
    if (focusId === this.lastFocusedId) {
      return;
    }
    this.lastFocusedId = focusId;
    const all = this.allFiltered();
    const idx = all.findIndex((a) => a.id === focusId);
    if (idx < 0) {
      return;
    }
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

  // ── Trail methods ───────────────────────────────────────

  protected toggleExpandTrail(trailId: string): void {
    this.expandedTrailIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(trailId)) {
        next.delete(trailId);
      } else {
        next.add(trailId);
      }
      return next;
    });
  }

  protected onSelectTrail(trail: TrailRecord): void {
    this.selectedTrail.set(trail);
    this.clearSelectedActivity();
  }

  // ── Trail panel menu state ──────────────────

  protected readonly trailPanelMenuOpen = signal(false);

  protected toggleTrailPanelMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.trailPanelMenuOpen.update((v) => !v);
    if (this.trailPanelMenuOpen()) {
      const close = (e: MouseEvent) => {
        this.trailPanelMenuOpen.set(false);
        globalThis.removeEventListener('click', close);
      };
      setTimeout(() => globalThis.addEventListener('click', close), 0);
    }
  }

  // ── Trail helper methods for the side panel ──

  protected trailMembers(trail: TrailRecord): ActivityRecord[] {
    const all = this.activities();
    if (!all) return [];
    return trail.activityIds
      .map((id) => all.find((a) => a.id === id))
      .filter((a): a is ActivityRecord => a !== undefined)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  protected trailDayCount(trail: TrailRecord): number {
    const members = this.trailMembers(trail);
    if (members.length === 0) return 0;
    const days = members.map((m) => m.startDate.slice(0, 10));
    return new Set(days).size;
  }

  protected trailHighestElevation(trail: TrailRecord): number {
    const members = this.trailMembers(trail);
    return Math.max(0, ...members.map((m) => m.totalElevationGainMeters ?? 0));
  }

  protected trailLongestActivity(trail: TrailRecord): number {
    const members = this.trailMembers(trail);
    return Math.max(0, ...members.map((m) => m.distanceMeters ?? 0));
  }

  protected trailAvgDistancePerDay(trail: TrailRecord): number {
    const members = this.trailMembers(trail);
    const total = members.reduce((s, m) => s + (m.distanceMeters ?? 0), 0);
    const days = this.trailDayCount(trail);
    return days > 0 ? total / days : 0;
  }

  protected isLastMember(index: number, length: number): boolean {
    return index === length - 1;
  }

  protected isFirstOfDayMember(index: number, members: ActivityRecord[]): boolean {
    if (index === 0) return true;
    const current = members[index]?.startDate?.slice(0, 10);
    const prev = members[index - 1]?.startDate?.slice(0, 10);
    return current !== prev;
  }

  protected memberDayIndex(index: number, members: ActivityRecord[]): number {
    let day = 1;
    for (let i = 0; i <= index; i++) {
      if (
        i > 0 &&
        members[i]?.startDate?.slice(0, 10) !== members[i - 1]?.startDate?.slice(0, 10)
      ) {
        day++;
      }
    }
    return day;
  }

  protected async onExportTrailGpx(trail: TrailRecord): Promise<void> {
    const members = this.trailMembers(trail);
    const segments = members.map((m) => ({
      name: m.name,
      startDate: m.startDate,
      activityId: m.id,
    }));
    await this.gpxExportService.exportTrail(trail.name, segments);
  }

  protected clearSelectedTrail(): void {
    this.selectedTrail.set(null);
  }

  protected async onCreateTrail(): Promise<void> {
    const selectedIds = this.selectedIds();
    const all = this.activities();
    if (!all || selectedIds.size < 2) {
      this.toastService.show('Select at least 2 activities to create a Trail.');
      return;
    }

    // Chronologically sort the selected activities
    const selected = all
      .filter((a) => selectedIds.has(a.id))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const { CreateTrailDialog } = await import('./create-trail-dialog.component');
    const ref = this.dialog.open(CreateTrailDialog, {
      data: {
        activities: selected,
        allActivities: all,
        suggestedName:
          (selected[0]?.name?.split(' ').slice(0, 2).join(' ') ?? 'New') + ' Adventure',
      },
      disableClose: true,
    });
    const result: { name: string; activityIds: string[] } | undefined = await ref
      .afterClosed()
      .toPromise();
    if (!result) return;

    try {
      const trail = await this.trailsService.create(result.name, result.activityIds);
      if (trail) {
        this.toastService.show(
          `Trail "${trail.name}" created with ${result.activityIds.length} activities.`,
        );
        this.clearSelection();
      } else {
        this.toastService.show(
          'Could not create Trail. One or more activities may already belong to another Trail.',
        );
      }
    } catch {
      this.toastService.show('Failed to create Trail. Please try again.');
    }
  }

  protected async onEditTrail(trail: TrailRecord): Promise<void> {
    const all = this.activities();
    if (!all) return;

    // Resolve member activities from IDs, sorted chronologically
    const memberActivities = trail.activityIds
      .map((id) => all.find((a) => a.id === id))
      .filter((a): a is ActivityRecord => a !== undefined)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const { CreateTrailDialog } = await import('./create-trail-dialog.component');
    const ref = this.dialog.open(CreateTrailDialog, {
      data: {
        activities: memberActivities,
        allActivities: all,
        suggestedName: trail.name,
        trail,
      },
      disableClose: true,
    });
    const result: { name: string; activityIds: string[]; trailId?: string } | undefined = await ref
      .afterClosed()
      .toPromise();
    if (!result) return;

    try {
      const nameChanged = result.name !== trail.name;
      const oldIds = new Set(trail.activityIds);
      const newIdsSet = new Set(result.activityIds);
      const toRemove = trail.activityIds.filter((id) => !newIdsSet.has(id));
      const toAdd = result.activityIds.filter((id) => !oldIds.has(id));

      if (nameChanged) {
        await this.trailsService.rename(trail.id, result.name);
      }
      for (const id of toRemove) {
        await this.trailsService.removeFromTrail(trail.id, id);
      }
      for (const id of toAdd) {
        await this.trailsService.addToTrail(trail.id, id);
      }

      this.toastService.show(`Trail "${result.name}" updated.`);
    } catch {
      this.toastService.show('Failed to update Trail. Please try again.');
    }
  }

  protected async onDeleteTrail(trail: TrailRecord): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Delete Trail?',
      message: `This removes the grouping only. Activities will remain in your library.`,
      confirmLabel: 'Delete Trail',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await this.trailsService.remove(trail.id);
      this.toastService.show(`Trail "${trail.name}" deleted.`);
      if (this.selectedTrail()?.id === trail.id) {
        this.clearSelectedTrail();
      }
    } catch {
      this.toastService.show('Failed to delete Trail. Please try again.');
    }
  }

  protected async onRemoveFromTrail(activityId: string, trail: TrailRecord): Promise<void> {
    // Check if this would dissolve the trail (only 1 activity remaining)
    if (trail.activityIds.filter((id) => id !== activityId).length < 2) {
      const confirmed = await this.confirmService.confirm({
        title: 'Dissolve Trail?',
        message: `Trails require at least two activities. Removing this activity will dissolve the "${trail.name}" Trail, but the remaining activity will be kept in your logbook.`,
        confirmLabel: 'Dissolve Trail',
        danger: true,
      });
      if (!confirmed) return;
    }
    const action = await this.trailsService.removeFromTrail(trail.id, activityId);
    if (action === 'dissolved') {
      this.toastService.show(`"${trail.name}" has been dissolved.`);
      if (this.selectedTrail()?.id === trail.id) {
        this.clearSelectedTrail();
      }
    } else {
      this.toastService.show('Activity removed from Trail.');
    }
  }

  protected navigateToTrailOnMap(trail: TrailRecord): void {
    this.router.navigate(['/map'], { queryParams: { trailId: trail.id } });
  }

  /** Finds an activity by ID from the loaded activities list. */
  protected getActivityById(id: string): ActivityRecord | undefined {
    return this.activities()?.find((a) => a.id === id);
  }

  /* ── Trail Mini Map ─────────────────────────────────────────── */

  private getTrailRouteCoords(): Map<string, [number, number][]> {
    const t = this.selectedTrail();
    if (!t) return new Map();
    const map = new Map<string, [number, number][]>();
    const members = this.trailMembers(t);
    for (const m of members) {
      const coords = this.getRouteCoords(m.id);
      if (coords) {
        map.set(m.id, coords);
      }
    }
    return map;
  }

  private avgSpeedMsForActivity(
    routeCoords: [number, number][],
    activity: ActivityRecord,
  ): number | undefined {
    if (activity.averageSpeedMetersPerSecond) return activity.averageSpeedMetersPerSecond;
    if (activity.distanceMeters && activity.movingTimeSeconds)
      return activity.distanceMeters / activity.movingTimeSeconds;
    return undefined;
  }

  private async initTrailMiniMap(): Promise<void> {
    if (this.trailMapReady()) return;
    const container = this.trailMiniMapContainer()?.nativeElement;
    if (!container) return;

    const provider = this.basemapProviderService.getDefaultProvider();
    const map = await this.mapLibreService.createMap(container, provider);
    this.trailMapInstance = map;

    map.dragPan.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.keyboard.enable();

    import('maplibre-gl').then((ml) => {
      const NavControl = (ml as any).NavigationControl ?? (ml as any).default?.NavigationControl;
      const ScaleControl = (ml as any).ScaleControl ?? (ml as any).default?.ScaleControl;
      if (NavControl) {
        map.addControl(new NavControl({ showCompass: false }), 'top-left');
      }
      if (ScaleControl) {
        map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
      }
    });

    this.trailMapReady.set(true);

    const doRender = () => this.renderTrailMiniMapRoutes();
    if (map.isStyleLoaded()) {
      doRender();
    } else {
      map.once('load', doRender);
    }
  }

  private renderTrailMiniMapRoutes(): void {
    const map = this.trailMapInstance;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('load', () => this.renderTrailMiniMapRoutes());
      return;
    }

    const t = this.selectedTrail();
    if (!t) return;

    const routeCoordsMap = this.getTrailRouteCoords();
    const members = this.trailMembers(t);

    // Collect all coordinates for bounds fitting
    const allCoords: [number, number][] = [];

    // Build speed-colored segments
    let allSegments: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const member of members) {
      const coords = routeCoordsMap.get(member.id);
      if (!coords || coords.length < 2) continue;
      allCoords.push(...coords);
      const avgMs = this.avgSpeedMsForActivity(coords, member);
      if (avgMs) {
        const segs = buildTrailSpeedSegments(coords, avgMs);
        allSegments.push(...segs);
      } else {
        allSegments.push({
          type: 'Feature',
          properties: { speedRatio: 1 },
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
    }

    if (allSegments.length === 0) {
      this.trailSpeedLegend.set(false);
      return;
    }

    this.trailSpeedLegend.set(allSegments.length > 0);

    // Compute global min/max speed ratios for the color ramp
    const ratios = allSegments
      .map((f) => f.properties?.['speedRatio'] as number)
      .filter((v) => v !== undefined);
    const minRatio = ratios.length > 0 ? Math.min(...ratios) : 0.5;
    const maxRatio = ratios.length > 0 ? Math.max(...ratios) : 1.5;
    const range = maxRatio - minRatio || 0.5;

    const colorStops: (number | string)[] = [];
    for (const sc of TRAIL_SPEED_COLORS) {
      const tNorm = sc.at / 2.0;
      const scaled = minRatio + tNorm * range;
      colorStops.push(scaled, sc.color);
    }
    const interpolateExpr: ExpressionSpecification = [
      'interpolate',
      ['linear'],
      ['get', 'speedRatio'],
      ...colorStops,
    ];

    const sourceId = 'trail-minimap-routes';
    const casingLayerId = 'trail-minimap-casing';
    const lineLayerId = 'trail-minimap-line';

    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getLayer(casingLayerId)) map.removeLayer(casingLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: allSegments },
    });

    map.addLayer({
      id: casingLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.9,
        'line-width': 6,
      },
    });

    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': interpolateExpr,
        'line-opacity': 0.9,
        'line-width': 4,
      },
    });

    if (allCoords.length >= 2) {
      map.fitBounds(
        [
          Math.min(...allCoords.map((c) => c[0])),
          Math.min(...allCoords.map((c) => c[1])),
          Math.max(...allCoords.map((c) => c[0])),
          Math.max(...allCoords.map((c) => c[1])),
        ],
        { padding: 10, maxZoom: 15, duration: 0 },
      );
    }
  }

  private destroyTrailMiniMap(): void {
    if (this.trailMapInstance) {
      this.trailMapInstance.remove();
      this.trailMapInstance = null;
    }
    this.trailMapReady.set(false);
    this.trailSpeedLegend.set(false);
    this.trailMapExpanded.set(false);
  }

  protected trailToggleMapExpand(): void {
    this.trailMapExpanded.update((v) => !v);
    setTimeout(() => this.trailMapInstance?.resize(), 100);
  }

  protected trailToggleLayerMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.trailLayerMenuOpen.update((v) => !v);
  }

  protected trailSelectLayer(config: BasemapProviderConfig): void {
    this.trailLayerMenuOpen.set(false);
    if (config.id === this.trailActiveLayerId()) return;

    this.trailActiveLayerId.set(config.id);
    this.basemapProviderService.setProvider(config);
    const map = this.trailMapInstance;
    if (map) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const pitch = map.getPitch();
      const bearing = map.getBearing();
      map.setStyle(config.styleUrl!);
      map.once('style.load', () => {
        this.renderTrailMiniMapRoutes();
        map.jumpTo({ center, zoom, pitch, bearing });
        import('maplibre-gl').then((ml) => {
          const NavControl =
            (ml as any).NavigationControl ?? (ml as any).default?.NavigationControl;
          const ScaleControl = (ml as any).ScaleControl ?? (ml as any).default?.ScaleControl;
          if (NavControl) {
            map.addControl(new NavControl({ showCompass: false }), 'top-left');
          }
          if (ScaleControl) {
            map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
          }
        });
      });
    }
  }
}

/**
 * Returns a sortable value (number or string) for a top-level row (trail or standalone activity)
 * based on the given column. Trail rows derive aggregate values from their member activities.
 */
function rowSortValue(
  row: { kind: 'trail' | 'activity'; data: VisibleLogbookRow },
  column: SortColumn,
): number | string {
  if (row.kind === 'trail') {
    const t = row.data as Extract<VisibleLogbookRow, { kind: 'trail' }>;
    switch (column) {
      case 'date':
        return t.ts;
      case 'name':
        return t.trail.name;
      case 'source':
        return t.memberActivities[0]?.provider ?? '';
      case 'status':
        return t.memberActivities.some((a) => (a.activityStatus ?? 'completed') !== 'completed')
          ? 1
          : 0;
      case 'type':
        return t.memberActivities[0]?.sportType ?? '';
      case 'distance':
        return t.totalDistanceMeters;
      case 'speed':
        return computeSpeed(undefined, t.totalDistanceMeters, t.totalMovingSeconds) ?? 0;
      case 'time':
        return t.totalMovingSeconds;
      case 'route':
        return Math.min(...t.memberActivities.map((a) => routeSortValue(a.routeSyncStatus)));
    }
  } else {
    const a = (row.data as Extract<VisibleLogbookRow, { kind: 'activity' }>).activity;
    switch (column) {
      case 'date':
        return new Date(a.startDate).getTime();
      case 'name':
        return a.name;
      case 'source':
        return activitySourceSortValue(a);
      case 'status':
        return activityStatusSortValue(a);
      case 'type':
        return a.sportType;
      case 'distance':
        return a.distanceMeters ?? 0;
      case 'speed':
        return (
          computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds) ?? 0
        );
      case 'time':
        return a.movingTimeSeconds ?? 0;
      case 'route':
        return routeSortValue(a.routeSyncStatus);
    }
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
      return (
        (computeSpeed(a.averageSpeedMetersPerSecond, a.distanceMeters, a.movingTimeSeconds) ?? 0) -
        (computeSpeed(b.averageSpeedMetersPerSecond, b.distanceMeters, b.movingTimeSeconds) ?? 0)
      );
    case 'time':
      return (a.movingTimeSeconds ?? 0) - (b.movingTimeSeconds ?? 0);
    case 'route':
      return routeSortValue(a.routeSyncStatus) - routeSortValue(b.routeSyncStatus);
  }
}

/* ── Speed-colour helpers (mirrored from trail-detail-panel) ──── */

const TRAIL_SPAN_SECONDS = 120;
const TRAIL_SPEED_COLORS = [
  { at: 0, color: '#3b82c4' },
  { at: 0.5, color: '#5fb8a0' },
  { at: 0.8, color: '#78c679' },
  { at: 1.0, color: '#1f6f50' },
  { at: 1.2, color: '#d9a23d' },
  { at: 1.5, color: '#d9732b' },
  { at: 2.0, color: '#b8433a' },
];

function trailHaversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildTrailSpeedSegments(
  coords: [number, number][],
  avgSpeedMs: number,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (coords.length < 2 || !avgSpeedMs || avgSpeedMs <= 0) return [];
  const spanMeters = Math.max(50, avgSpeedMs * TRAIL_SPAN_SECONDS);
  const spans: { startIdx: number; endIdx: number; dist: number }[] = [];
  let spanStart = 0;
  let spanDist = 0;
  for (let i = 1; i < coords.length; i++) {
    const segDist = trailHaversineDistance(
      coords[i - 1][0],
      coords[i - 1][1],
      coords[i][0],
      coords[i][1],
    );
    spanDist += segDist;
    if (spanDist >= spanMeters || i === coords.length - 1) {
      spans.push({ startIdx: spanStart, endIdx: i, dist: spanDist });
      spanStart = i;
      spanDist = 0;
    }
  }
  if (spans.length < 2) return [];
  const pointCounts = spans.map((s) => s.endIdx - s.startIdx + 1);
  const avgPoints = pointCounts.reduce((s, c) => s + c, 0) / pointCounts.length;
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const span of spans) {
    const coordsInSpan = coords.slice(span.startIdx, span.endIdx + 1);
    if (coordsInSpan.length < 2) continue;
    const pointDensity = span.dist > 0 ? coordsInSpan.length / span.dist : 0;
    const normDensity = avgPoints > 0 ? pointDensity / (avgPoints / spanMeters) : 1;
    const speedRatio = normDensity > 0 ? 1 / normDensity : 2;
    features.push({
      type: 'Feature',
      properties: { speedRatio: Math.max(0.1, Math.min(3, speedRatio)) },
      geometry: { type: 'LineString', coordinates: coordsInSpan },
    });
  }
  return features;
}

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
import { ActivitiesToolbarComponent } from './activities-toolbar.component';
import { ActivitiesStatsComponent } from './activities-stats.component';
import { ActivitiesSourceFilterComponent } from './activities-source-filter.component';
import { ActivitiesSelectedActionsComponent } from './activities-selected-actions.component';
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
  imports: [LoadingSpinnerComponent, RouteSparklineComponent, ActivityDetailPanelComponent, IconComponent, ActivitiesToolbarComponent, ActivitiesStatsComponent, ActivitiesSourceFilterComponent, ActivitiesSelectedActionsComponent],
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
  protected readonly sourceFilterExpanded = signal(localStorage.getItem('trailroam_activities_source_filter_expanded') !== 'false');

  protected resetSourceFilter(): void {
    this.sourceFilter.set(new Set());
  }

  protected toggleSourceFilterExpanded(): void {
    this.sourceFilterExpanded.update((v) => !v);
    localStorage.setItem('trailroam_activities_source_filter_expanded', String(this.sourceFilterExpanded()));
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

  protected readonly activeSource = computed(() => {
    const s = this.sourceFilter();
    if (s.size === 0) return 'all';
    if (s.has('strava')) return 'strava';
    if (s.has('imported-completed')) return 'imported-completed';
    if (s.has('imported-planned')) return 'imported-planned';
    return 'all';
  });

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
    this.focusRowAndHighlight(id);
  }

  private focusRowAndHighlight(rowId: string): void {
    const all = this.allFiltered();
    const idx = all.findIndex((a) => a.id === rowId);
    if (idx < 0) { return; }
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

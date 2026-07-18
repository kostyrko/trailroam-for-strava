import { Component, input, output, computed, signal, inject, DestroyRef } from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import { type MapRouteFeature } from './mock-routes';
import { formatDistance, formatDuration, formatDateShort } from '../shared/formatters';
import { sportTypeEmojiFromString } from '../shared/activity-display';
import type { SavedPlaceRecord } from '../storage/storage.models';

/**
 * A single unified row in the "All" view. Discriminated by `kind` so the template can render
 * per-type visuals (emoji for activities, pin for places) and route actions to the right output.
 */
export type AllRow =
  | { kind: 'activity'; activityId: string; route: MapRouteFeature; ts: number }
  | { kind: 'place'; id: string; place: SavedPlaceRecord; ts: number };

/**
 * Presentational panel for the "All" left-panel view: merges activities and saved places into one
 * list, ordered newest-first, with each row visually identifiable by type. Mirrors the structure
 * and row styling of `MapActivityPanelComponent` / `MapPlacesPanelComponent`. Emits selection,
 * edit, and remove intents; the container (`MapPage`) performs the work.
 */
@Component({
  selector: 'app-map-all-panel',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './map-all-panel.component.html',
  styleUrl: './map-all-panel.component.scss',
})
export class MapAllPanelComponent {
  /** Activity routes to render (filtered, as provided by the container). */
  readonly routes = input<MapRouteFeature[]>([]);
  /** Saved places to render (newest-first, as provided by the container). */
  readonly places = input<SavedPlaceRecord[]>([]);
  /** Currently selected activity id (for highlight). */
  readonly selectedActivityId = input<string | null>(null);
  /** Currently focused place id (for highlight). */
  readonly selectedPlaceId = input<string | null>(null);

  readonly selectRoute = output<MapRouteFeature>();
  readonly hoverRoute = output<MapRouteFeature | null>();
  readonly selectPlace = output<SavedPlaceRecord>();
  readonly editPlace = output<SavedPlaceRecord>();
  readonly removePlace = output<SavedPlaceRecord>();

  protected readonly searchQuery = signal('');
  protected readonly openMenuId = signal<string | null>(null);
  private searchInputTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (!target?.closest('.all-row__menu') && !target?.closest('.all-dropdown')) {
        this.openMenuId.set(null);
      }
    };
    globalThis.addEventListener('click', handler);
    this.destroyRef.onDestroy(() => globalThis.removeEventListener('click', handler));
  }

  /**
   * Merges activities and places into one newest-first list. Activities sort by their start date;
   * places by their `createdAt`. Equal timestamps are stable (activities before places is fine).
   */
  protected readonly rows = computed<AllRow[]>(() => {
    const activities = this.routes().map((route) => ({
      kind: 'activity' as const,
      activityId: route.activityId,
      route,
      ts: this.toTimestamp(route.activity.startDate),
    }));
    const places = this.places().map((place) => ({
      kind: 'place' as const,
      id: place.id,
      place,
      ts: this.toTimestamp(place.createdAt),
    }));
    return [...activities, ...places].sort((a, b) => b.ts - a.ts);
  });

  protected readonly filteredRows = computed<AllRow[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.rows();
    if (!query) { return list; }
    return list.filter((row) => {
      if (row.kind === 'activity') {
        return (
          row.route.activity.name.toLowerCase().includes(query) ||
          row.route.activity.sportType.toLowerCase().includes(query)
        );
      }
      return (
        row.place.name.toLowerCase().includes(query) ||
        (row.place.secondaryLabel?.toLowerCase().includes(query) ?? false)
      );
    });
  });

  protected readonly activityCount = computed(() => this.routes().length);
  protected readonly placeCount = computed(() => this.places().length);

  private toTimestamp(iso: string | undefined): number {
    if (!iso) { return 0; }
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  protected onSearchInput(value: string): void {
    if (this.searchInputTimeout) { clearTimeout(this.searchInputTimeout); }
    this.searchInputTimeout = setTimeout(() => this.searchQuery.set(value), 150);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected onSelectActivity(route: MapRouteFeature): void {
    this.selectRoute.emit(route);
  }

  protected onHoverActivity(route: MapRouteFeature | null): void {
    this.hoverRoute.emit(route);
  }

  protected onSelectPlace(place: SavedPlaceRecord): void {
    this.selectPlace.emit(place);
  }

  protected toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuId.update((open) => (open === id ? null : id));
  }

  protected onEditPlace(place: SavedPlaceRecord, event: Event): void {
    event.stopPropagation();
    this.openMenuId.set(null);
    this.editPlace.emit(place);
  }

  protected onRemovePlace(place: SavedPlaceRecord, event: Event): void {
    event.stopPropagation();
    this.openMenuId.set(null);
    this.removePlace.emit(place);
  }

  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDateShort = formatDateShort;
  protected readonly sportTypeEmojiFromString = sportTypeEmojiFromString;
}

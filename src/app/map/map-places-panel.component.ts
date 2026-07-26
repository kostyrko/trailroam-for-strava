import { Component, input, output, computed, signal, inject, DestroyRef } from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import type { SavedPlaceRecord } from '../storage/storage.models';

/**
 * Presentational panel listing saved places. Mirrors the structure and styling of
 * `MapActivityPanelComponent`: a header with a count, a search field, and a list of rows. In
 * `compact` mode (used by the "All" view) it renders as a bounded section without the full-height
 * absolute shell, so it can sit above the activity list.
 *
 * The component never touches storage or the map — it emits `selectPlace` / `editPlace` /
 * `removePlace` and the container (`MapPage`) performs the work.
 */
@Component({
  selector: 'app-map-places-panel',
  standalone: true,
  imports: [IconComponent],
  host: { '[class.places-host--compact]': 'compact()' },
  templateUrl: './map-places-panel.component.html',
  styleUrl: './map-places-panel.component.scss',
})
export class MapPlacesPanelComponent {
  /** Saved places to render (newest-first, as provided by the container). */
  readonly places = input<SavedPlaceRecord[]>([]);
  /** Currently focused place id (for highlight). */
  readonly selectedPlaceId = input<string | null>(null);
  /** Section mode for the "All" view: bounded height, no absolute shells. */
  readonly compact = input(false);
  /** Whether the panel is expanded (visible) or collapsed. */
  readonly panelExpanded = input(true);
  /** Skip the slide transition (used on initial render). */
  readonly noTransition = input(false);

  readonly selectPlace = output<SavedPlaceRecord>();
  readonly editPlace = output<SavedPlaceRecord>();
  readonly removePlace = output<SavedPlaceRecord>();
  /** Emits the new expanded state when the user toggles the panel. */
  readonly panelExpandedChange = output<boolean>();

  protected readonly searchQuery = signal('');
  /** Id of the place whose overflow menu is currently open (one menu at a time). */
  protected readonly openMenuId = signal<string | null>(null);
  private searchInputTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Close the overflow menu on any click outside a row's menu, mirroring the activity-card
    // pattern. Runs on the document so clicks elsewhere (e.g. the map) also dismiss it.
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (!target?.closest('.place-row__menu') && !target?.closest('.place-dropdown')) {
        this.openMenuId.set(null);
      }
    };
    globalThis.addEventListener('click', handler);
    this.destroyRef.onDestroy(() => globalThis.removeEventListener('click', handler));
  }

  protected readonly filteredPlaces = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.places();
    if (!query) {
      return list;
    }
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.secondaryLabel?.toLowerCase().includes(query) ?? false),
    );
  });

  protected toggle(): void {
    this.panelExpandedChange.emit(!this.panelExpanded());
  }

  protected onSearchInput(value: string): void {
    if (this.searchInputTimeout) {
      clearTimeout(this.searchInputTimeout);
    }
    this.searchInputTimeout = setTimeout(() => this.searchQuery.set(value), 150);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected onSelectPlace(place: SavedPlaceRecord): void {
    this.selectPlace.emit(place);
  }

  protected toggleMenu(place: SavedPlaceRecord, event: Event): void {
    event.stopPropagation();
    this.openMenuId.update((id) => (id === place.id ? null : place.id));
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
}

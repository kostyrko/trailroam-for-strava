import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import { tryParseCoordinate, type ParsedCoordinate } from '../shared/formatters/coordinate.parse';
import { GeocodingService, type GeocodeResult } from './geocoding.service';
import { RecentSearchesService, type RecentSearchEntry } from './recent-searches.service';

export interface SearchSelectedPayload {
  result: GeocodeResult;
  /** Whether the result originated from a coordinate input (skipped the geocoder). */
  kind: 'place' | 'coordinate';
}

const AUTOCOMPLETE_DEBOUNCE_MS = 250;
const MIN_AUTOCOMPLETE_LENGTH = 2;

/**
 * Presentational Map Explorer search panel.
 *
 * Responsibilities are intentionally limited to input handling, autocomplete, and the
 * recent-searches list. The component never touches the map directly — on a successful
 * search it emits `searchSelected`; the container (`MapPage`) performs the navigation.
 */
@Component({
  selector: 'app-map-search-panel',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './map-search-panel.component.html',
  styleUrl: './map-search-panel.component.scss',
})
export class MapSearchPanelComponent implements OnInit, OnDestroy {
  private readonly geocoding = inject(GeocodingService);
  private readonly recentSearches = inject(RecentSearchesService);

  readonly query = signal('');
  readonly suggestions = signal<GeocodeResult[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly recent = this.recentSearches.entries;
  /** The most recently committed search result (kept so the Save action can target it). */
  readonly selectedResult = signal<GeocodeResult | null>(null);

  /** When true, the selected result is already a saved place — show "Saved" instead of "Save". */
  @Input() set selectedResultSaved(value: boolean) {
    this._selectedResultSaved = value;
  }
  get selectedResultSaved(): boolean {
    return this._selectedResultSaved;
  }
  private _selectedResultSaved = false;

  @Output() readonly searchSelected = new EventEmitter<SearchSelectedPayload>();
  /** Emitted when the user clicks "Save place" for the currently selected result. */
  @Output() readonly saveRequested = new EventEmitter<GeocodeResult>();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSearch = 0;

  ngOnInit(): void {
    this.recentSearches.load();
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
  }

  onQueryInput(value: string): void {
    this.query.set(value);
    this.error.set(null);
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }

    const trimmed = value.trim();
    if (trimmed.length < MIN_AUTOCOMPLETE_LENGTH) {
      this.suggestions.set([]);
      this.loading.set(false);
      return;
    }
    // Coordinate typing should not trigger autocomplete requests.
    if (tryParseCoordinate(trimmed)) {
      this.suggestions.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.debounceTimer = setTimeout(async () => {
      const mySearch = ++this.activeSearch;
      try {
        const results = await this.geocoding.search(trimmed);
        if (mySearch !== this.activeSearch) { return; }
        this.suggestions.set(results);
      } finally {
        if (mySearch === this.activeSearch) { this.loading.set(false); }
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  }

  onPickSuggestion(result: GeocodeResult): void {
    this.commit(result, 'place');
  }

  onSubmit(): void {
    const trimmed = this.query().trim();
    if (!trimmed) { return; }
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }

    const coord = tryParseCoordinate(trimmed);
    if (coord) {
      this.commit(parsedToResult(coord), 'coordinate');
      return;
    }
    void this.resolvePlace(trimmed);
  }

  onRepeat(entry: RecentSearchEntry): void {
    this.commit(
      { label: entry.label, center: entry.center },
      entry.kind,
    );
  }

  onRemoveEntry(entry: RecentSearchEntry, event: Event): void {
    event.stopPropagation();
    this.recentSearches.remove(entry.id);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.suggestions.set([]);
      this.error.set(null);
    }
  }

  private async resolvePlace(query: string): Promise<void> {
    const mySearch = ++this.activeSearch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.geocoding.resolve(query);
      if (mySearch !== this.activeSearch) { return; }
      if (!result) {
        this.error.set(`No places found for "${query}".`);
        return;
      }
      this.commit(result, 'place');
    } catch {
      if (mySearch !== this.activeSearch) { return; }
      this.error.set('Search is unavailable right now. Try again.');
    } finally {
      if (mySearch === this.activeSearch) { this.loading.set(false); }
    }
  }

  private commit(result: GeocodeResult, kind: 'place' | 'coordinate'): void {
    this.activeSearch++;
    this.searchSelected.emit({ result, kind });
    this.recentSearches.add(result, kind);
    // Retain the result so the Save action (and the "Saved" state) can target it. Clearing the
    // query/suggestions keeps the input tidy without dropping the selection.
    this.selectedResult.set(result);
    this._selectedResultSaved = false;
    this.query.set('');
    this.suggestions.set([]);
    this.error.set(null);
    this.loading.set(false);
  }

  /** Emits a save request for the currently selected result. */
  protected requestSave(): void {
    const result = this.selectedResult();
    if (!result) { return; }
    this.saveRequested.emit(result);
  }
}

function parsedToResult(parsed: ParsedCoordinate): GeocodeResult {
  return { label: parsed.label, center: parsed.center };
}

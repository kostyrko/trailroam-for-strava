import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MapSearchPanelComponent,
} from './map-search-panel.component';
import { GeocodingService, type GeocodeResult } from './geocoding.service';
import { RecentSearchesService, type RecentSearchEntry } from './recent-searches.service';

function mockResult(label: string, lng = 1, lat = 2): GeocodeResult {
  return { label, center: [lng, lat] };
}

describe('MapSearchPanelComponent', () => {
  let geocodeMock: { search: ReturnType<typeof vi.fn>; resolve: ReturnType<typeof vi.fn> };
  let recentMock: {
    entries: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    geocodeMock = {
      search: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockResolvedValue(null),
    };
    recentMock = {
      entries: vi.fn().mockReturnValue([]),
      load: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        MapSearchPanelComponent,
        { provide: GeocodingService, useValue: geocodeMock },
        { provide: RecentSearchesService, useValue: recentMock },
      ],
    });
  });

  function create(): MapSearchPanelComponent {
    const c = TestBed.inject(MapSearchPanelComponent);
    c.ngOnInit();
    return c;
  }

  it('loads recent searches on init', () => {
    create();
    expect(recentMock.load).toHaveBeenCalled();
  });

  it('coordinate submit resolves locally without calling the geocoder', async () => {
    const c = create();
    const emitted = vi.fn();
    c.searchSelected.subscribe(emitted);

    c.onQueryInput('50.0647, 19.9450');
    c.onSubmit();

    expect(geocodeMock.resolve).not.toHaveBeenCalled();
    expect(geocodeMock.search).not.toHaveBeenCalled();
    expect(emitted).toHaveBeenCalledTimes(1);
    const payload = emitted.mock.calls[0][0];
    expect(payload.kind).toBe('coordinate');
    expect(payload.result.center).toEqual([19.945, 50.0647]);
    expect(payload.result.label).toBe('50.0647, 19.945');
  });

  it('place submit resolves through the geocoder and emits a place result', async () => {
    const krakow = mockResult('Kraków, Poland', 19.9, 50.06);
    geocodeMock.resolve.mockResolvedValue(krakow);
    const c = create();
    const emitted = vi.fn();
    c.searchSelected.subscribe(emitted);

    c.onQueryInput('Kraków');
    await c.onSubmit();
    await Promise.resolve();

    expect(geocodeMock.resolve).toHaveBeenCalledWith('Kraków');
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0][0].result).toBe(krakow);
    expect(emitted.mock.calls[0][0].kind).toBe('place');
  });

  it('failed place search adds nothing to recent and emits nothing', async () => {
    geocodeMock.resolve.mockResolvedValue(null);
    const c = create();
    const emitted = vi.fn();
    c.searchSelected.subscribe(emitted);

    c.onQueryInput('nowhere-real-xyz');
    await c.onSubmit();
    await Promise.resolve();

    expect(emitted).not.toHaveBeenCalled();
    expect(recentMock.add).not.toHaveBeenCalled();
    expect(c.error()).toContain('No places found');
  });

  it('onSubmit does nothing for empty query', () => {
    const c = create();
    const emitted = vi.fn();
    c.searchSelected.subscribe(emitted);
    c.onSubmit();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('picking a suggestion commits it as a place search', () => {
    const c = create();
    const emitted = vi.fn();
    c.searchSelected.subscribe(emitted);
    const result = mockResult('Zakopane', 19.94, 49.29);
    c.onPickSuggestion(result);
    expect(emitted.mock.calls[0][0].result).toBe(result);
    expect(recentMock.add).toHaveBeenCalledWith(result, 'place');
  });

  it('repeating a recent entry re-emits and re-adds with its kind', () => {
    const c = create();
    const emitted = vi.fn();
    c.searchSelected.subscribe(emitted);
    const entry: RecentSearchEntry = {
      id: 'x',
      label: 'Tatra National Park',
      center: [20.0, 49.3],
      kind: 'place',
      searchedAt: '2026-01-01T00:00:00.000Z',
    };
    c.onRepeat(entry);
    expect(emitted.mock.calls[0][0].result.label).toBe('Tatra National Park');
    expect(recentMock.add).toHaveBeenCalled();
  });

  it('remove button stops propagation and does NOT emit a search', () => {
    const c = create();
    const emitted = vi.fn();
    c.searchSelected.subscribe(emitted);
    const entry: RecentSearchEntry = {
      id: 'x',
      label: 'Zakopane',
      center: [19.94, 49.29],
      kind: 'place',
      searchedAt: '2026-01-01T00:00:00.000Z',
    };
    const stopPropagation = vi.fn();
    c.onRemoveEntry(entry, { stopPropagation } as unknown as Event);
    expect(recentMock.remove).toHaveBeenCalledWith('x');
    expect(stopPropagation).toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('coordinate input does not trigger autocomplete requests', async () => {
    const c = create();
    c.onQueryInput('50.06, 19.94');
    // allow any pending timers (should be none for coordinates)
    await new Promise((r) => setTimeout(r, 10));
    expect(geocodeMock.search).not.toHaveBeenCalled();
    expect(c.suggestions()).toEqual([]);
  });

  it('autocomplete fires debounced for non-coordinate input', async () => {
    geocodeMock.search.mockResolvedValue([mockResult('Kraków')]);
    const c = create();
    c.onQueryInput('Krak');
    expect(geocodeMock.search).not.toHaveBeenCalled(); // debounced
    await new Promise((r) => setTimeout(r, 300));
    expect(geocodeMock.search).toHaveBeenCalledWith('Krak');
    expect(c.suggestions()).toHaveLength(1);
  });

  it('autocomplete is not triggered for very short queries', async () => {
    const c = create();
    c.onQueryInput('K');
    await new Promise((r) => setTimeout(r, 300));
    expect(geocodeMock.search).not.toHaveBeenCalled();
  });

  it('escape clears suggestions and error', () => {
    const c = create();
    c.suggestions.set([mockResult('x')]);
    c.error.set('boom');
    c.onKeydown({ key: 'Escape' } as KeyboardEvent);
    expect(c.suggestions()).toEqual([]);
    expect(c.error()).toBeNull();
  });
});

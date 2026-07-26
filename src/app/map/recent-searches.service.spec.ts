import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RecentSearchesService } from './recent-searches.service';
import type { GeocodeResult } from './geocoding.service';

const KEY = 'trailroam_map_recent_searches';

function result(label: string, lng = 1, lat = 2): GeocodeResult {
  return { label, center: [lng, lat] };
}

describe('RecentSearchesService', () => {
  let service: RecentSearchesService;

  beforeEach(() => {
    localStorage.clear();
    service = new RecentSearchesService();
    service.load();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(service.entries()).toEqual([]);
  });

  it('adds a new entry at the top', () => {
    service.add(result('Kraków', 19, 50));
    service.add(result('Zakopane', 19, 49));
    expect(service.entries().map((e) => e.label)).toEqual(['Zakopane', 'Kraków']);
  });

  it('moves a duplicate to the top instead of duplicating', () => {
    service.add(result('Kraków'));
    service.add(result('Zakopane'));
    service.add(result('Kraków'));
    const entries = service.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0].label).toBe('Kraków');
    expect(entries[1].label).toBe('Zakopane');
  });

  it('treats duplicates case-insensitively', () => {
    service.add(result('Kraków'));
    service.add(result('kraków'));
    expect(service.entries()).toHaveLength(1);
  });

  it('removes only the targeted entry', () => {
    service.add(result('Kraków'));
    service.add(result('Zakopane'));
    service.add(result('Tatra National Park'));
    const zakId = service.entries().find((e) => e.label === 'Zakopane')!.id;
    service.remove(zakId);
    expect(service.entries().map((e) => e.label)).toEqual([
      'Tatra National Park',
      'Kraków',
    ]);
  });

  it('caps history at 10 entries, dropping the oldest', () => {
    for (let i = 0; i < 12; i++) {
      service.add(result(`Place ${i}`));
    }
    const labels = service.entries().map((e) => e.label);
    expect(labels).toHaveLength(10);
    expect(labels[0]).toBe('Place 11');
    // oldest two dropped
    expect(labels).not.toContain('Place 0');
    expect(labels).not.toContain('Place 1');
  });

  it('persists to localStorage and restores on load()', () => {
    service.add(result('Kraków'));
    service.add(result('Tatra National Park'));

    const restored = new RecentSearchesService();
    restored.load();
    expect(restored.entries().map((e) => e.label)).toEqual([
      'Tatra National Park',
      'Kraków',
    ]);
  });

  it('ignores malformed persisted JSON and starts empty', () => {
    localStorage.setItem(KEY, '{not valid json');
    const restored = new RecentSearchesService();
    restored.load();
    expect(restored.entries()).toEqual([]);
  });

  it('filters out invalid entries from persisted JSON', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'a', label: 'Valid', center: [1, 2], kind: 'place', searchedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', label: 'NoCenter' },
        { 'weird': true },
      ]),
    );
    const restored = new RecentSearchesService();
    restored.load();
    expect(restored.entries().map((e) => e.label)).toEqual(['Valid']);
  });

  it('coordinate entries are tagged with kind=coordinate', () => {
    service.add(result('50.06, 19.94'), 'coordinate');
    expect(service.entries()[0].kind).toBe('coordinate');
  });

  it('survives a simulated restart preserving order exactly', () => {
    service.add(result('Kraków'));
    service.add(result('Zakopane'));
    service.add(result('Tatra National Park'));
    const before = service.entries().map((e) => e.label);

    const restored = new RecentSearchesService();
    restored.load();
    expect(restored.entries().map((e) => e.label)).toEqual(before);
  });
});

describe('RecentSearchesService duplicate timestamp', () => {
  it('updates searchedAt when moving a duplicate to top', async () => {
    localStorage.clear();
    const service = new RecentSearchesService();
    service.load();
    service.add(result('Kraków'));
    const firstTs = service.entries()[0].searchedAt;
    await new Promise((r) => setTimeout(r, 5));
    service.add(result('Kraków'));
    const secondTs = service.entries()[0].searchedAt;
    expect(secondTs).not.toBe(firstTs);
  });
});

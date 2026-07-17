import { Injectable, signal } from '@angular/core';
import { logger } from '../shared/logger';
import type { GeocodeResult } from './geocoding.service';

export type RecentSearchKind = 'place' | 'coordinate';

export interface RecentSearchEntry {
  id: string;
  label: string;
  center: [number, number];
  kind: RecentSearchKind;
  searchedAt: string;
}

const STORAGE_KEY = 'trailroam_map_recent_searches';
const MAX_ENTRIES = 10;

/**
 * Stores the user's recent map searches in `localStorage`.
 *
 * No Chrome `storage` permission is required for `localStorage`. History is capped at the
 * 10 most recent entries. Duplicate labels (case-insensitive, trimmed) are moved to the
 * top instead of duplicated, with their timestamp refreshed.
 */
@Injectable({ providedIn: 'root' })
export class RecentSearchesService {
  private readonly _entries = signal<RecentSearchEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  load(): void {
    this._entries.set(this.readFromStorage());
  }

  add(result: GeocodeResult, kind: RecentSearchKind = 'place'): void {
    const now = new Date().toISOString();
    const label = result.label.trim();
    const existing = this._entries().filter(
      (e) => e.label.toLowerCase() !== label.toLowerCase(),
    );
    const next: RecentSearchEntry[] = [
      {
        id: this.deriveId(label),
        label,
        center: result.center,
        kind,
        searchedAt: now,
      },
      ...existing,
    ].slice(0, MAX_ENTRIES);
    this.commit(next);
  }

  remove(id: string): void {
    const next = this._entries().filter((e) => e.id !== id);
    this.commit(next);
  }

  private readFromStorage(): RecentSearchEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { return []; }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) { return []; }
      // Preserve stored order (newest-first, as written) rather than re-sorting by
      // timestamp — entries written in the same millisecond would otherwise be unstable.
      return parsed.filter(isEntry).slice(0, MAX_ENTRIES);
    } catch (err) {
      logger.error('Failed to read recent searches:', err);
      return [];
    }
  }

  private commit(entries: RecentSearchEntry[]): void {
    this._entries.set(entries);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      logger.error('Failed to persist recent searches:', err);
    }
  }

  private deriveId(label: string): string {
    const slug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    return slug || `search-${Date.now()}`;
  }
}

function isEntry(value: unknown): value is RecentSearchEntry {
  if (typeof value !== 'object' || value === null) { return false; }
  const e = value as { id?: unknown; label?: unknown; center?: unknown; searchedAt?: unknown };
  return (
    typeof e['id'] === 'string' &&
    typeof e['label'] === 'string' &&
    Array.isArray(e['center']) &&
    e['center'].length === 2 &&
    typeof e['center'][0] === 'number' &&
    typeof e['center'][1] === 'number' &&
    typeof e['searchedAt'] === 'string'
  );
}

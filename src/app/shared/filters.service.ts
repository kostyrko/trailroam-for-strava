import { Injectable, computed, signal } from '@angular/core';
import type { ActivityCategory } from '../storage/storage.models';

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'ride',
  'run',
  'walk',
  'hike',
  'water',
  'paddling',
  'winter',
  'other',
];

export const CATEGORY_COLORS: Record<string, string> = {
  ride: '#1f6f50',
  run: '#2d7fb8',
  walk: '#b87a2d',
  hike: '#8b5e3c',
  water: '#3c9bb8',
  paddling: '#3ca8a8',
  winter: '#8ba8c8',
  other: '#63746a',
};

function parseDateParam(value: string | undefined | null): string | null {
  if (!value) { return null; }
  const d = new Date(value);
  if (isNaN(d.getTime())) { return null; }
  return d.toISOString();
}

export type DatePreset = 'all' | '7d' | '30d' | 'year' | 'custom';

export function isAfterOrEqual(isoDate: string, isoBound: string): boolean {
  return new Date(isoDate).getTime() >= new Date(isoBound).getTime();
}

export function isBeforeOrEqual(isoDate: string, isoBound: string): boolean {
  return new Date(isoDate).getTime() <= new Date(isoBound).getTime();
}

@Injectable({
  providedIn: 'root',
})
export class FiltersService {
  readonly categoryFilter = signal<ActivityCategory | null>(null);
  readonly sportTypeFilter = signal<string | null>(null);
  readonly dateFrom = signal<string | null>(null);
  readonly dateTo = signal<string | null>(null);
  readonly nameSearch = signal<string>('');
  readonly datePreset = signal<DatePreset>('all');
  /** set to true the first time the user explicitly interacts with any filter */
  userInteracted = false;
  readonly datePresetLabel = computed(() => {
    const p = this.datePreset();
    switch (p) {
      case 'all': return 'All dates';
      case '7d': return 'Last 7 days';
      case '30d': return 'Last 30 days';
      case 'year': return 'This year';
      case 'custom': return 'Custom range';
      default: return 'All dates';
    }
  });

  setDateFrom(value: string): void {
    this.dateFrom.set(parseDateParam(value));
    this.userInteracted = true;
  }

  setDateTo(value: string): void {
    this.dateTo.set(parseDateParam(value));
    this.userInteracted = true;
  }

  clearDateFrom(): void {
    this.dateFrom.set(null);
    this.userInteracted = true;
  }

  clearDateTo(): void {
    this.dateTo.set(null);
    this.userInteracted = true;
  }

  setNameSearch(value: string): void {
    this.nameSearch.set(value);
    this.userInteracted = true;
  }

  clearNameSearch(): void {
    this.nameSearch.set('');
    this.userInteracted = true;
  }

  setSportTypeFilter(value: string): void {
    this.sportTypeFilter.set(value === '' ? null : value);
    this.userInteracted = true;
  }

  setDatePreset(value: DatePreset): void {
    this.datePreset.set(value);
    this.userInteracted = true;
  }

  clearAll(): void {
    this.categoryFilter.set(null);
    this.sportTypeFilter.set(null);
    this.dateFrom.set(null);
    this.dateTo.set(null);
    this.nameSearch.set('');
    this.datePreset.set('all');
    this.userInteracted = true;
  }
}

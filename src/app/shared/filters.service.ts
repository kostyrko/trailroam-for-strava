import { Injectable, signal } from '@angular/core';
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

function parseDateParam(value: string | undefined | null): string | null {
  if (!value) { return null; }
  const d = new Date(value);
  if (isNaN(d.getTime())) { return null; }
  return d.toISOString();
}

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
  readonly dateFrom = signal<string | null>(null);
  readonly dateTo = signal<string | null>(null);

  setDateFrom(value: string): void {
    this.dateFrom.set(parseDateParam(value));
  }

  setDateTo(value: string): void {
    this.dateTo.set(parseDateParam(value));
  }

  clearDateFrom(): void {
    this.dateFrom.set(null);
  }

  clearDateTo(): void {
    this.dateTo.set(null);
  }

  clearAll(): void {
    this.categoryFilter.set(null);
    this.dateFrom.set(null);
    this.dateTo.set(null);
  }
}

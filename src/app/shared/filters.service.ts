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

@Injectable({
  providedIn: 'root',
})
export class FiltersService {
  readonly categoryFilter = signal<ActivityCategory | null>(null);

  clearCategoryFilter(): void {
    this.categoryFilter.set(null);
  }
}

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import { DateRangePickerComponent } from '../shared/date-range-picker.component';
import {
  formatSportType,
  formatCategory,
  mapSportTypeToCategory,
} from '../shared/activity-category';
import type { ActivityCategory } from '../storage/storage.models';

@Component({
  selector: 'app-activities-toolbar',
  standalone: true,
  imports: [IconComponent, DateRangePickerComponent],
  templateUrl: './activities-toolbar.component.html',
  styleUrl: './activities-toolbar.component.scss',
})
export class ActivitiesToolbarComponent {
  protected readonly formatSportType = formatSportType;
  protected readonly formatCategory = formatCategory;
  protected readonly mapSportTypeToCategory = mapSportTypeToCategory;

  @Input() nameSearch = '';
  @Input() sportTypeFilter: string | null = '';
  @Input() datePresetLabel = '';
  @Input() datePresetOpen = false;
  @Input() dateFrom: string | null = '';
  @Input() dateTo: string | null = '';
  @Input() filterMenuOpen!: boolean;
  @Input() sportTypeGroups!: { category: string; sportTypes: string[] }[];
  @Input() CATEGORY_COLORS!: Record<string, string>;
  @Input() hasTrails = false;
  @Input() trailCount = 0;

  @Output() nameSearchChange = new EventEmitter<string>();
  @Output() sportTypeChange = new EventEmitter<string>();
  @Output() categoryFilterChange = new EventEmitter<ActivityCategory>();
  @Output() toggleFilterMenu = new EventEmitter<void>();
  @Output() closeFilterMenu = new EventEmitter<void>();
  @Output() toggleDatePreset = new EventEmitter<void>();
  @Output() datePresetClose = new EventEmitter<void>();
  @Output() rangeApplied = new EventEmitter<{ dateFrom: string; dateTo: string }>();
  @Output() importClick = new EventEmitter<void>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() clearFilters = new EventEmitter<void>();
}

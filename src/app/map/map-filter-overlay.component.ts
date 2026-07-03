import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import { DateRangePickerComponent } from '../shared/date-range-picker.component';
import { formatSportType, formatCategory, mapSportTypeToCategory } from '../shared/activity-category';
import type { ActivityCategory } from '../storage/storage.models';

@Component({
  selector: 'app-map-filter-overlay',
  standalone: true,
  imports: [IconComponent, DateRangePickerComponent],
  templateUrl: './map-filter-overlay.component.html',
  styleUrl: './map-filter-overlay.component.scss',
})
export class MapFilterOverlayComponent {
  protected readonly formatSportType = formatSportType;
  protected readonly formatCategory = formatCategory;
  protected readonly mapSportTypeToCategory = mapSportTypeToCategory;

  @Input() sportTypeFilter: string | null = '';
  @Input() filterMenuOpen = false;
  @Input() sportTypeGroups: { category: string; sportTypes: string[] }[] = [];
  @Input() CATEGORY_COLORS!: Record<string, string>;
  @Input() datePresetLabel = '';
  @Input() datePresetOpen = false;
  @Input() filtersDateFrom: string | null = '';
  @Input() filtersDateTo: string | null = '';
  @Input() autoFilterHighlight = false;

  @Output() sportTypeChange = new EventEmitter<string>();
  @Output() categoryFilterChange = new EventEmitter<ActivityCategory>();
  @Output() toggleFilterMenu = new EventEmitter<void>();
  @Output() closeFilterMenu = new EventEmitter<void>();
  @Output() toggleDatePreset = new EventEmitter<void>();
  @Output() closeDatePreset = new EventEmitter<void>();
  @Output() rangeApplied = new EventEmitter<{ dateFrom: string; dateTo: string }>();
}

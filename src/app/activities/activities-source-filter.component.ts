import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-activities-source-filter',
  standalone: true,
  imports: [],
  templateUrl: './activities-source-filter.component.html',
  styleUrl: './activities-source-filter.component.scss',
})
export class ActivitiesSourceFilterComponent {
  @Input() sourceFilterExpanded!: boolean;
  @Input() activeSourceSet: Set<'strava' | 'imported-completed' | 'imported-planned'> = new Set();
  @Input() allCount!: number;
  @Input() stravaCount!: number;
  @Input() importedCompletedCount!: number;
  @Input() importedPlannedCount!: number;

  @Output() toggleExpanded = new EventEmitter<void>();
  @Output() sourceFilterChange = new EventEmitter<Set<'strava' | 'imported-completed' | 'imported-planned'>>();
  @Output() selectAll = new EventEmitter<void>();

  protected onChipClick(key: 'strava' | 'imported-completed' | 'imported-planned'): void {
    const next = new Set(this.activeSourceSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.sourceFilterChange.emit(next);
  }
}

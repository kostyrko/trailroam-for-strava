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
  @Input() activeSource!: string;
  @Input() allCount!: number;
  @Input() stravaCount!: number;
  @Input() importedCompletedCount!: number;
  @Input() importedPlannedCount!: number;

  @Output() toggleExpanded = new EventEmitter<void>();
  @Output() selectAll = new EventEmitter<void>();
  @Output() selectStrava = new EventEmitter<void>();
  @Output() selectImportedCompleted = new EventEmitter<void>();
  @Output() selectImportedPlanned = new EventEmitter<void>();
}

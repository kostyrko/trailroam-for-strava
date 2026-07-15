import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-activities-selected-actions',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './activities-selected-actions.component.html',
  styleUrl: './activities-selected-actions.component.scss',
})
export class ActivitiesSelectedActionsComponent {
  @Input() selectionCount!: number;

  @Output() downloadGpx = new EventEmitter<void>();
  @Output() deleteSelected = new EventEmitter<void>();
  @Output() clearSelection = new EventEmitter<void>();
}

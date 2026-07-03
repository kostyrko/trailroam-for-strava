import { Component, Input } from '@angular/core';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-activities-stats',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './activities-stats.component.html',
  styleUrl: './activities-stats.component.scss',
})
export class ActivitiesStatsComponent {
  @Input() statCount!: string;
  @Input() statDistance!: string;
  @Input() statMovingTime!: string;
  @Input() statAvgSpeed!: string;
}

import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-map-notice-banners',
  standalone: true,
  imports: [],
  templateUrl: './map-notice-banners.component.html',
  styleUrl: './map-notice-banners.component.scss',
})
export class MapNoticeBannersComponent {
  @Input() performanceWarning!: string | null;
  @Input() autoFilterHint!: string | null;
  @Input() hasBasemapError!: boolean;

  @Output() dismissPerformance = new EventEmitter<void>();
  @Output() dismissAutoFilter = new EventEmitter<void>();
  @Output() retryBasemap = new EventEmitter<void>();
}

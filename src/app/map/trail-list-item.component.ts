import { Component, input, output } from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import { formatDistance, formatDateShort } from '../shared/formatters';
import type { SidebarTrailItem } from './map-activity-panel.component';

/**
 * A reusable trail list item used in both the Activities tab and All tab of the
 * map explorer left panel. Displays the trail name, activity count, total distance,
 * and date range, with a "Trail" badge and selected state.
 */
@Component({
  selector: 'app-trail-list-item',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './trail-list-item.component.html',
  styleUrl: './trail-list-item.component.scss',
})
export class TrailListItemComponent {
  /** The trail item data to render. */
  readonly trailItem = input.required<SidebarTrailItem>();
  /** Whether this trail is currently selected (highlighted). */
  readonly selected = input(false);

  /** Emits the trail id when the user clicks the item. */
  readonly selectTrail = output<string>();

  protected readonly formatDistance = formatDistance;
  protected readonly formatDateShort = formatDateShort;
}

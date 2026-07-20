import { Component, input, output } from '@angular/core';
import { IconComponent } from '../shared/icon.component';

/**
 * A lightweight custom context menu for the map. Renders a small popup near the
 * pointer position with actions like "Add place". Closes on action, click-outside,
 * or Escape — the parent is responsible for all of those triggers.
 */
@Component({
  selector: 'app-map-context-menu',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './map-context-menu.component.html',
  styleUrl: './map-context-menu.component.scss',
})
export class MapContextMenuComponent {
  /** Horizontal pixel position (relative to the viewport). */
  readonly x = input.required<number>();
  /** Vertical pixel position (relative to the viewport). */
  readonly y = input.required<number>();

  /** Emitted when the user clicks "Add place". */
  readonly addPlace = output<void>();
}

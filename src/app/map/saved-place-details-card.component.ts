import { Component, input, output } from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import type { SavedPlaceRecord } from '../storage/storage.models';

/**
 * Presentational card displayed inside a MapLibre popup when hovering or selecting a saved-place
 * marker. Shows the place name, administrative location, notes, and action buttons (Edit / Remove).
 *
 * Rendered dynamically by {@link MapLibreMapComponent} via `createComponent` + `ApplicationRef`.
 * All business logic stays in the container — this component only emits output events.
 */
@Component({
  selector: 'app-saved-place-details-card',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './saved-place-details-card.component.html',
  styleUrl: './saved-place-details-card.component.scss',
})
export class SavedPlaceDetailsCardComponent {
  /** The saved place to display. */
  readonly place = input.required<SavedPlaceRecord>();

  /** Whether the card is visible (controls the fade+scale entry animation). */
  readonly visible = input(false);

  /** Emits the place when the user clicks "Edit". */
  readonly edit = output<SavedPlaceRecord>();

  /** Emits the place when the user clicks "Remove". */
  readonly remove = output<SavedPlaceRecord>();

  /** Emits when the user clicks the close (×) button. */
  readonly close = output<void>();
}

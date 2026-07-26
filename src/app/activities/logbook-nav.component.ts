import { Component, input, output } from '@angular/core';
import { IconComponent } from '../shared/icon.component';

export interface LogbookNavItem {
  /** Unique identifier matching the view value (e.g. 'activities', 'places', 'all'). */
  id: string;
  /** Human-readable label displayed below the icon. */
  label: string;
  /** Icon name from the app's icon set. */
  icon: string;
  /** Numeric badge shown beside the label. */
  count: number;
}

/**
 * Data-driven secondary navigation for the Logbook page. Renders a horizontal card with
 * icon + label + count-badge items. The active item is highlighted with a subtle background
 * and a bottom indicator line. Supports keyboard navigation via arrow keys.
 *
 * Adding a new tab requires only adding an entry to the `items` array — no structural changes.
 */
@Component({
  selector: 'app-logbook-nav',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './logbook-nav.component.html',
  styleUrl: './logbook-nav.component.scss',
})
export class LogbookNavComponent {
  /** Ordered list of navigation items to render. */
  readonly items = input<LogbookNavItem[]>([]);

  /** Id of the currently active item. */
  readonly activeId = input<string>('');

  /** Emits the id of the item the user selected. */
  readonly activeIdChange = output<string>();

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const items = this.items();
    if (items.length === 0) return;

    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % items.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      this.activeIdChange.emit(items[nextIndex].id);
    }
  }

  protected onItemClick(id: string): void {
    this.activeIdChange.emit(id);
  }
}

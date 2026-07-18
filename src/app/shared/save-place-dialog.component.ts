import { Component, inject, signal, viewChild, ElementRef, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { IconComponent } from './icon.component';
import {
  MAX_PLACE_NAME_LENGTH,
  MAX_PLACE_NOTES_LENGTH,
  isValidPlaceName,
  isValidPlaceNotes,
  sanitizePlaceName,
  sanitizePlaceNotes,
} from './formatters/place-name';

/** Input to the dialog — used for both creating a new place and editing an existing one. */
export interface SavePlaceDialogData {
  /**
   * Dialog mode:
   * - `create` — "Save place": name prefilled from the provider suggestion.
   * - `edit` — "Edit place": name/notes prefilled from the existing record.
   */
  mode: 'create' | 'edit';
  /** Name prefilled into the input. */
  suggestedName: string;
  /** Notes prefilled into the textarea (edit mode only). */
  suggestedNotes?: string;
  /** Optional secondary location text shown under the title for context. */
  secondaryLabel?: string;
}

/** Result of a confirmed save/edit: the trimmed name and notes, or `undefined` on cancel. */
export interface SavePlaceDialogResult {
  name: string;
  notes: string;
}

@Component({
  selector: 'app-save-place-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule, IconComponent],
  templateUrl: './save-place-dialog.component.html',
  styleUrl: './save-place-dialog.component.scss',
})
export class SavePlaceDialog {
  protected readonly dialogRef = inject(MatDialogRef<SavePlaceDialog, SavePlaceDialogResult | undefined>);
  protected readonly data = inject<SavePlaceDialogData>(MAT_DIALOG_DATA);

  protected readonly MAX_PLACE_NAME_LENGTH = MAX_PLACE_NAME_LENGTH;
  protected readonly MAX_PLACE_NOTES_LENGTH = MAX_PLACE_NOTES_LENGTH;
  protected readonly isEdit = this.data.mode === 'edit';
  protected name = this.data.suggestedName;
  protected notes = this.data.suggestedNotes ?? '';
  protected readonly error = signal<string | null>(null);

  protected readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    afterNextRender(() => {
      const input = this.nameInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  protected errorMessage = (): string | null => this.error();

  protected canSave = (): boolean => isValidPlaceName(this.name) && isValidPlaceNotes(this.notes);

  protected onInput(): void {
    const trimmed = this.name.trim();
    if (trimmed.length === 0) {
      this.error.set('Name cannot be empty');
    } else if (this.name.length > MAX_PLACE_NAME_LENGTH) {
      this.error.set(`Name must be ${MAX_PLACE_NAME_LENGTH} characters or fewer`);
    } else if (!isValidPlaceNotes(this.notes)) {
      this.error.set(`Notes must be ${MAX_PLACE_NOTES_LENGTH} characters or fewer`);
    } else {
      this.error.set(null);
    }
  }

  protected onSave(): void {
    const name = sanitizePlaceName(this.name);
    const notes = sanitizePlaceNotes(this.notes);
    if (!isValidPlaceName(name) || !isValidPlaceNotes(notes)) { return; }
    this.dialogRef.close({ name, notes });
  }
}

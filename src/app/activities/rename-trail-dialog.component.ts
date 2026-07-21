import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';

export interface RenameTrailDialogData {
  currentName: string;
}

@Component({
  selector: 'app-rename-trail-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule],
  styles: [
    `
      :host {
        display: block;
        max-width: 400px;
        padding: 24px;
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
      }
      h2 {
        font-size: 1.125rem;
        font-weight: 700;
        color: #111827;
        margin: 0 0 16px;
      }
      .field-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: #374151;
        margin: 0 0 6px;
      }
      input[type='text'] {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dce6df;
        border-radius: 8px;
        padding: 10px 12px;
        font: inherit;
        font-size: 0.875rem;
        color: #111827;
        outline: none;
      }
      input[type='text']:focus {
        border-color: #15803d;
        box-shadow: 0 0 0 2px rgba(21, 128, 61, 0.15);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 20px;
      }
      .btn {
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        height: 36px;
        padding: 0 16px;
      }
      .btn-primary {
        background: #15803d;
        color: #fff;
      }
      .btn-primary:hover {
        background: #166534;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .btn-secondary {
        background: #fff;
        border: 1px solid #dce6df;
        color: #374151;
      }
      .btn-secondary:hover {
        background: #f9fafb;
      }
      .char-count {
        font-size: 0.6875rem;
        color: #9ca3af;
        text-align: right;
        margin-top: 4px;
      }
    `,
  ],
  template: `
    <h2>Rename Trail</h2>
    <div class="field-label">Trail name</div>
    <input
      type="text"
      [(ngModel)]="name"
      (keydown.enter)="onSave()"
      placeholder="Enter trail name"
      maxlength="100"
      aria-label="Trail name"
    />
    <div class="char-count">{{ name.length }}/100</div>

    <div class="actions">
      <button class="btn btn-secondary" type="button" (click)="onCancel()">Cancel</button>
      <button class="btn btn-primary" type="button" (click)="onSave()" [disabled]="!name.trim()">
        Save
      </button>
    </div>
  `,
})
export class RenameTrailDialog {
  protected name: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) protected readonly data: RenameTrailDialogData,
    private readonly dialogRef: MatDialogRef<RenameTrailDialog>,
  ) {
    this.name = data.currentName;
  }

  protected onSave(): void {
    const trimmed = this.name.trim();
    if (!trimmed) return;
    this.dialogRef.close({ name: trimmed });
  }

  protected onCancel(): void {
    this.dialogRef.close();
  }
}

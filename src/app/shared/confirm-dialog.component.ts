import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button class="dialog-cancel-btn" [mat-dialog-close]="false">Cancel</button>
      <span class="dialog-actions-spacer"></span>
      <button
        mat-button
        class="dialog-confirm-btn"
        [class.danger]="data.danger"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
      max-width: 440px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    h2 {
      color: #14211b;
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0 0 8px;
    }
    p {
      color: #53645b;
      font-size: 1rem;
      line-height: 1.5;
      margin: 0;
    }
    .dialog-actions-spacer {
      flex: 1;
    }
    .dialog-cancel-btn {
      align-items: center;
      background: transparent;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #314b3f;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.9375rem;
      font-weight: 600;
      min-height: 40px;
      padding: 8px 16px;
    }
    .dialog-cancel-btn:hover {
      background: #eef5f0;
    }
    .dialog-confirm-btn {
      align-items: center;
      background: #1f6f50;
      border: 0;
      border-radius: 6px;
      color: #ffffff;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      min-height: 40px;
      padding: 8px 16px;
    }
    .dialog-confirm-btn:hover {
      background: #185940;
    }
    .dialog-confirm-btn.danger {
      background: #8f2d22;
    }
    .dialog-confirm-btn.danger:hover {
      background: #74231a;
    }
  `],
})
export class ConfirmDialog {
  protected readonly dialogRef = inject(MatDialogRef<ConfirmDialog>);
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

import { Component, Inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import type { ActivityRecord } from '../storage/storage.models';
import { sportTypeEmoji } from '../shared/activity-display';

export interface CreateTrailDialogData {
  activities: ActivityRecord[];
  suggestedName: string;
}

export interface CreateTrailDialogResult {
  name: string;
  /** The filtered list of activity IDs after the user has removed any. */
  activityIds: string[];
}

@Component({
  selector: 'app-create-trail-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule],
  styles: [
    `
      :host {
        display: block;
        max-width: 460px;
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
      .activity-list {
        margin: 16px 0;
        max-height: 260px;
        overflow-y: auto;
        background: #f9fafb;
        border-radius: 8px;
        padding: 4px 4px;
      }
      .activity-list-item {
        font-size: 0.8125rem;
        color: #374151;
        padding: 6px 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 6px;
        transition: background 120ms ease;
      }
      .activity-list-item:hover {
        background: #eef5f0;
      }
      .activity-list-item__name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
      .btn-remove {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 4px;
        color: #9ca3af;
        cursor: pointer;
        display: inline-flex;
        flex-shrink: 0;
        height: 20px;
        justify-content: center;
        padding: 0;
        transition:
          background 120ms ease,
          color 120ms ease;
        width: 20px;
      }
      .btn-remove:hover,
      .btn-remove:focus-visible {
        background: #fce4e4;
        color: #dc2626;
      }
      .btn-remove:focus-visible {
        outline: 2px solid #dc2626;
        outline-offset: -2px;
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
    <h2>Create Trail</h2>
    <div class="field-label">Trail name</div>
    <input
      type="text"
      [(ngModel)]="name"
      (keydown.enter)="onSave()"
      placeholder="Enter trail name"
      maxlength="100"
      aria-label="Trail name"
      #nameInput
    />
    <div class="char-count">{{ name.length }}/100</div>

    <div class="field-label">
      Selected activities ({{ activities().length }})
      @if (activities().length < 2) {
        <span class="field-label__hint"> — at least 2 required</span>
      }
    </div>
    <div class="activity-list">
      @for (a of activities(); track a.id) {
        <div class="activity-list-item">
          <span>{{ sportTypeEmoji(a) }}</span>
          <span class="activity-list-item__name">{{ a.name }}</span>
          <button
            class="btn-remove"
            type="button"
            (click)="onRemoveActivity(a.id)"
            attr.aria-label="Remove {{ a.name }} from trail"
            title="Remove"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      }
    </div>

    <div class="actions">
      <button class="btn btn-secondary" type="button" (click)="onCancel()">Cancel</button>
      <button
        class="btn btn-primary"
        type="button"
        (click)="onSave()"
        [disabled]="!name.trim() || activities().length < 2"
      >
        Create
      </button>
    </div>
  `,
})
export class CreateTrailDialog {
  protected name: string;
  protected readonly activities = signal<ActivityRecord[]>([]);
  protected readonly sportTypeEmoji = sportTypeEmoji;

  constructor(
    @Inject(MAT_DIALOG_DATA) protected readonly data: CreateTrailDialogData,
    private readonly dialogRef: MatDialogRef<CreateTrailDialog, CreateTrailDialogResult>,
  ) {
    this.name = data.suggestedName;
    this.activities.set([...data.activities]);
  }

  protected onRemoveActivity(activityId: string): void {
    this.activities.update((list) => list.filter((a) => a.id !== activityId));
  }

  protected onSave(): void {
    const trimmed = this.name.trim();
    if (!trimmed || this.activities().length < 2) return;
    this.dialogRef.close({
      name: trimmed,
      activityIds: this.activities().map((a) => a.id),
    });
  }

  protected onCancel(): void {
    this.dialogRef.close();
  }
}

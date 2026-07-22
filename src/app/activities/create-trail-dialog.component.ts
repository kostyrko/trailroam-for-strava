import { Component, Inject, computed, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import type { ActivityRecord, TrailRecord } from '../storage/storage.models';
import { sportTypeEmoji } from '../shared/activity-display';
import { mapSportTypeToCategory } from '../shared/activity-category';
import { CATEGORY_COLORS } from '../shared/filters.service';
import { formatDistance, formatDuration, formatDate, formatDateShort } from '../shared/formatters';

export interface CreateTrailDialogData {
  /** Activities initially selected for the trail (chronologically sorted). */
  activities: ActivityRecord[];
  /** All activities available for adding more (optional — omit to disable "Add more"). */
  allActivities?: ActivityRecord[];
  suggestedName: string;
  /** When set, the dialog runs in edit mode for an existing trail. */
  trail?: TrailRecord;
}

export interface CreateTrailDialogResult {
  name: string;
  /** The filtered list of activity IDs after the user has added/removed. */
  activityIds: string[];
  /** Present when editing an existing trail. */
  trailId?: string;
}

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? '#63746a';
}

@Component({
  selector: 'app-create-trail-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule],
  styles: [
    `
      :host {
        display: block;
        max-width: 520px;
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

      /* ── Title ──────────────────────────────── */
      h2 {
        font-size: 1.125rem;
        font-weight: 700;
        color: #111827;
        margin: 0 0 2px;
      }
      .subtitle {
        font-size: 0.8125rem;
        color: #63746a;
        margin: 0 0 16px;
      }

      /* ── Trail name input ───────────────────── */
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
      .char-count {
        font-size: 0.6875rem;
        color: #9ca3af;
        text-align: right;
        margin-top: 3px;
        margin-bottom: 12px;
      }

      /* ── Summary stats panel ────────────────── */
      .summary-panel {
        background: #f4f9f6;
        border: 1px solid #dce6df;
        border-radius: 8px;
        display: flex;
        gap: 0;
        margin-bottom: 16px;
        overflow: hidden;
      }
      .summary-stat {
        flex: 1;
        padding: 12px 8px;
        text-align: center;
      }
      .summary-stat + .summary-stat {
        border-left: 1px solid #dce6df;
      }
      .summary-stat__value {
        display: block;
        font-size: 1.125rem;
        font-weight: 700;
        color: #14211b;
        line-height: 1.3;
      }
      .summary-stat__label {
        display: block;
        font-size: 0.6875rem;
        color: #63746a;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-top: 2px;
      }

      /* ── Activity list ──────────────────────── */
      .activity-list {
        margin-bottom: 8px;
        max-height: 240px;
        overflow-y: auto;
        border: 1px solid #dce6df;
        border-radius: 8px;
        padding: 4px;
      }
      .activity-list-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 8px;
        border-radius: 6px;
        transition: background 120ms ease;
      }
      .activity-list-item:hover {
        background: #f4f9f6;
      }
      .activity-emoji-wrap {
        align-items: center;
        border-radius: 6px;
        display: inline-flex;
        flex-shrink: 0;
        height: 32px;
        justify-content: center;
        width: 32px;
      }
      .activity-emoji-wrap span {
        font-size: 1rem;
        line-height: 1;
      }
      .activity-info {
        flex: 1;
        min-width: 0;
      }
      .activity-info__name {
        font-size: 0.8125rem;
        font-weight: 600;
        color: #14211b;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .activity-info__meta {
        font-size: 0.75rem;
        color: #63746a;
        margin-top: 1px;
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
        height: 24px;
        justify-content: center;
        padding: 0;
        transition:
          background 120ms ease,
          color 120ms ease;
        width: 24px;
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

      /* ── Add more button ────────────────────── */
      .btn-add-more {
        align-items: center;
        background: transparent;
        border: 1px dashed #dce6df;
        border-radius: 8px;
        color: #63746a;
        cursor: pointer;
        display: flex;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        gap: 6px;
        justify-content: center;
        margin-bottom: 16px;
        padding: 10px 16px;
        transition:
          background 120ms ease,
          border-color 120ms ease,
          color 120ms ease;
        width: 100%;
      }
      .btn-add-more:hover {
        background: #f4f9f6;
        border-color: #15803d;
        color: #15803d;
      }
      .btn-add-more:focus-visible {
        outline: 2px solid #15803d;
        outline-offset: -2px;
      }

      /* ── Inline picker (add-more expanded) ──── */
      .picker-section {
        margin-bottom: 16px;
      }
      .picker-search {
        margin-bottom: 8px;
      }
      .picker-search input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dce6df;
        border-radius: 8px;
        padding: 8px 10px;
        font: inherit;
        font-size: 0.8125rem;
        color: #111827;
        outline: none;
      }
      .picker-search input:focus {
        border-color: #15803d;
        box-shadow: 0 0 0 2px rgba(21, 128, 61, 0.15);
      }
      .picker-list {
        max-height: 180px;
        overflow-y: auto;
        border: 1px solid #dce6df;
        border-radius: 8px;
        padding: 4px;
      }
      .picker-item {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: #374151;
        cursor: pointer;
        display: flex;
        font: inherit;
        font-size: 0.8125rem;
        gap: 8px;
        padding: 6px 8px;
        text-align: left;
        transition: background 120ms ease;
        width: 100%;
      }
      .picker-item:hover {
        background: #eef5f0;
      }
      .picker-item:focus-visible {
        outline: 2px solid #15803d;
        outline-offset: -2px;
      }
      .picker-item__emoji {
        flex-shrink: 0;
        font-size: 0.875rem;
      }
      .picker-item__name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .picker-item__date {
        flex-shrink: 0;
        color: #9ca3af;
        font-size: 0.75rem;
      }
      .picker-empty {
        color: #9ca3af;
        font-size: 0.8125rem;
        padding: 12px;
        text-align: center;
      }

      /* ── Footer ─────────────────────────────── */
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
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
    `,
  ],
  template: `
    @let editing = !!data.trail;
    <h2>{{ editing ? 'Edit Trail' : 'Create Trail' }}</h2>
    <p class="subtitle">
      @if (editing) {
        Update trail name and activities
      } @else {
        Combine {{ activities().length }} activities into one trail
      }
    </p>

    <!-- Trail name -->
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

    <!-- Summary stats -->
    <div class="summary-panel">
      <div class="summary-stat">
        <span class="summary-stat__value">{{ formatDistance(totalDistance()) }}</span>
        <span class="summary-stat__label">Distance</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat__value">{{ formatDuration(totalDuration()) }}</span>
        <span class="summary-stat__label">Duration</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat__value">{{ activities().length }}</span>
        <span class="summary-stat__label">
          {{ activities().length === 1 ? 'Activity' : 'Activities' }}
        </span>
      </div>
    </div>

    <!-- Selected activities -->
    <div class="activity-list">
      @for (a of activities(); track a.id) {
        <div class="activity-list-item">
          <span class="activity-emoji-wrap" [style.background]="catBg(a)" [style.color]="catFg(a)">
            <span>{{ sportTypeEmoji(a) }}</span>
          </span>
          <div class="activity-info">
            <div class="activity-info__name">{{ a.name }}</div>
            <div class="activity-info__meta">
              {{ formatDate(a.startDate) }}
              @if (a.distanceMeters) {
                · {{ formatDistance(a.distanceMeters) }}
              }
              @if (a.movingTimeSeconds) {
                · {{ formatDuration(a.movingTimeSeconds) }}
              }
            </div>
          </div>
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

    <!-- Add more activities -->
    @if (data.allActivities && data.allActivities.length > 0) {
      <button class="btn-add-more" type="button" (click)="pickerOpen.set(!pickerOpen())">
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
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add more activities
      </button>

      @if (pickerOpen()) {
        <div class="picker-section">
          <div class="picker-search">
            <input
              type="text"
              [(ngModel)]="pickerQuery"
              placeholder="Search activities…"
              aria-label="Search activities to add"
            />
          </div>
          <div class="picker-list">
            @let avail = availableActivities();
            @if (avail.length === 0) {
              <div class="picker-empty">
                {{ pickerQuery() ? 'No matching activities' : 'All activities already selected' }}
              </div>
            }
            @for (a of avail; track a.id) {
              <button class="picker-item" type="button" (click)="onAddActivity(a)">
                <span class="picker-item__emoji">{{ sportTypeEmoji(a) }}</span>
                <span class="picker-item__name">{{ a.name }}</span>
                <span class="picker-item__date">{{ formatDateShort(a.startDate) }}</span>
              </button>
            }
          </div>
        </div>
      }
    }

    <!-- Footer -->
    <div class="actions">
      <button class="btn btn-secondary" type="button" (click)="onCancel()">Cancel</button>
      <button
        class="btn btn-primary"
        type="button"
        (click)="onSave()"
        [disabled]="!name.trim() || activities().length < 2"
      >
        {{ data.trail ? 'Save Changes' : 'Create Trail' }}
      </button>
    </div>
  `,
})
export class CreateTrailDialog {
  protected name: string;
  protected readonly activities = signal<ActivityRecord[]>([]);
  protected readonly pickerOpen = signal(false);
  protected readonly pickerQuery = signal('');

  protected readonly sportTypeEmoji = sportTypeEmoji;
  protected readonly formatDate = formatDate;
  protected readonly formatDateShort = formatDateShort;
  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;

  protected readonly totalDistance = computed(() =>
    this.activities().reduce((s, a) => s + (a.distanceMeters ?? 0), 0),
  );
  protected readonly totalDuration = computed(() =>
    this.activities().reduce((s, a) => s + (a.movingTimeSeconds ?? 0), 0),
  );

  /** Activities from the full list that are not yet selected, filtered by search query. */
  protected readonly availableActivities = computed(() => {
    const all = this.data.allActivities ?? [];
    const selectedIds = new Set(this.activities().map((a) => a.id));
    const q = this.pickerQuery().toLowerCase().trim();
    return all.filter((a) => {
      if (selectedIds.has(a.id)) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) protected readonly data: CreateTrailDialogData,
    private readonly dialogRef: MatDialogRef<CreateTrailDialog, CreateTrailDialogResult>,
  ) {
    this.name = data.suggestedName;
    this.activities.set([...data.activities]);
  }

  protected catBg(a: ActivityRecord): string {
    const cat = mapSportTypeToCategory(a.sportType);
    return categoryColor(cat) + '20'; // 12% opacity
  }
  protected catFg(a: ActivityRecord): string {
    const cat = mapSportTypeToCategory(a.sportType);
    return categoryColor(cat);
  }

  protected onRemoveActivity(activityId: string): void {
    this.activities.update((list) => list.filter((a) => a.id !== activityId));
  }

  protected onAddActivity(activity: ActivityRecord): void {
    this.activities.update((list) => [...list, activity]);
    // Keep the picker open so the user can add more
  }

  protected onSave(): void {
    const trimmed = this.name.trim();
    if (!trimmed || this.activities().length < 2) return;
    this.dialogRef.close({
      name: trimmed,
      activityIds: this.activities().map((a) => a.id),
      trailId: this.data.trail?.id,
    });
  }

  protected onCancel(): void {
    this.dialogRef.close();
  }
}

import { Component, inject, signal, viewChild, ElementRef, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { IconComponent } from './icon.component';
import { formatSportType } from './activity-category';
import type { ActivityStatus } from '../storage/storage.models';

export interface EditActivityDialogData {
  currentName: string;
  currentSportType: string;
  currentActivityStatus: ActivityStatus;
}

export interface EditDialogResult {
  name: string;
  sportType: string;
  activityStatus: ActivityStatus;
}

const MAX_NAME_LENGTH = 50;

const SPORT_TYPES = [
  'Walk', 'Hike', 'TrailRun', 'Run', 'Ride', 'GravelRide',
  'MountainBikeRide', 'EBikeRide', 'Swim', 'Kayaking', 'Canoeing',
  'StandUpPaddling', 'AlpineSki', 'BackcountrySki', 'NordicSki',
  'Snowboard', 'Snowshoe', 'RockClimbing', 'Golf', 'Workout', 'Other',
];

const SPORT_TYPE_EMOJI: Record<string, string> = {
  Ride: '🚴', GravelRide: '🚴', MountainBikeRide: '🚵', EBikeRide: '🚴', EMountainBikeRide: '🚵', VirtualRide: '🚴',
  Run: '🏃', TrailRun: '🏃', VirtualRun: '🏃',
  Walk: '🚶', Hike: '🥾',
  Swim: '🏊',
  Kayaking: '🛶', Canoeing: '🛶', StandUpPaddling: '🛶', Rowing: '🛶',
  AlpineSki: '⛷️', BackcountrySki: '⛷️', NordicSki: '⛷️', Snowboard: '🏂', Snowshoe: '🥾',
  RockClimbing: '🧗', Golf: '🏌️',
  Other: '🏋️', Workout: '🏋️',
};

@Component({
  selector: 'app-edit-activity-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule, IconComponent],
  template: `
    <div class="edit-overlay" (click)="dialogRef.close()">
      <div class="edit-dialog" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <button class="edit-close" type="button" (click)="dialogRef.close()" aria-label="Close dialog">
          <app-icon name="x" [size]="14" strokeWidth="2"></app-icon>
        </button>

        <div class="edit-icon">
          <app-icon name="pencil" [size]="20" strokeWidth="2"></app-icon>
        </div>

        <h2 class="edit-title" id="edit-title">Edit activity</h2>
        <p class="edit-subtitle">Update name, sport type and status</p>

        <div class="edit-field">
          <label class="edit-label" for="edit-input">Activity name</label>
          <div class="edit-input-wrap">
            <input
              id="edit-input"
              class="edit-input"
              [class.edit-input--error]="!!errorMessage()"
              [(ngModel)]="name"
              (input)="onInput()"
              (keydown.enter)="onSave()"
              (keydown.escape)="dialogRef.close()"
              maxlength="50"
              placeholder="Morning Ride"
              #nameInput
              autocomplete="off"
            />
            <span
              class="edit-chars"
              [class.edit-chars--warn]="name.length >= MAX_NAME_LENGTH"
            >{{ name.length }}/{{ MAX_NAME_LENGTH }}</span>
          </div>
          @if (errorMessage(); as msg) {
            <p class="edit-error" role="alert">{{ msg }}</p>
          }
        </div>

        <div class="edit-field">
          <label class="edit-label" for="edit-sport">Sport type</label>
          <div class="edit-select-wrap">
            <span class="edit-select-emoji">{{ sportTypeEmoji(sportType()) }}</span>
            <select
              id="edit-sport"
              class="edit-select"
              [ngModel]="sportType()"
              (ngModelChange)="sportType.set($event)"
            >
              @for (st of SPORT_TYPES; track st) {
                <option [value]="st">{{ formatSportType(st) }}</option>
              }
            </select>
            <app-icon name="chevron-down" [size]="14" strokeWidth="2" [class]="'edit-select-arrow'"></app-icon>
          </div>
        </div>

        <div class="edit-field">
          <label class="edit-label">Activity status</label>
          <div class="edit-status-group">
            <label class="edit-status-option">
              <input type="radio" name="activityStatus" [value]="'completed'" [(ngModel)]="activityStatus" />
              <span class="edit-status-dot"></span>
              Completed
            </label>
            <label class="edit-status-option">
              <input type="radio" name="activityStatus" [value]="'planned'" [(ngModel)]="activityStatus" />
              <span class="edit-status-dot"></span>
              Planned
            </label>
          </div>
        </div>

        <div class="edit-actions">
          <button class="edit-btn edit-btn--secondary" type="button" (click)="dialogRef.close()">Cancel</button>
          <button class="edit-btn edit-btn--primary" type="button" [disabled]="!canSave()" (click)="onSave()">
            <app-icon name="check-circle" [size]="14" strokeWidth="2"></app-icon>
            Save changes
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .edit-overlay {
      align-items: center;
      background: rgb(20 33 27 / 35%);
      backdrop-filter: blur(3px);
      display: flex;
      inset: 0;
      justify-content: center;
      position: fixed;
      z-index: 1000;
    }

    .edit-dialog {
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgb(20 33 27 / 14%);
      box-sizing: border-box;
      max-width: 370px;
      padding: 28px;
      position: relative;
      width: 100%;
      animation: edit-in 150ms ease-out;
    }

    @keyframes edit-in {
      from {
        opacity: 0;
        transform: scale(0.96) translateY(6px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .edit-close {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: #859b8e;
      cursor: pointer;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      padding: 0;
      position: absolute;
      right: 12px;
      top: 12px;
      transition: background 120ms ease, color 120ms ease;
      width: 28px;
    }

    .edit-close:hover {
      background: #eef5f0;
      color: #14211b;
    }

    .edit-close:focus-visible {
      box-shadow: 0 0 0 2px rgb(31 111 80 / 40%);
      outline: 0;
    }

    .edit-icon {
      align-items: center;
      background: #e6f7ef;
      border-radius: 50%;
      color: #1f6f50;
      display: flex;
      height: 44px;
      justify-content: center;
      margin: 0 auto 14px;
      width: 44px;
    }

    .edit-title {
      color: #14211b;
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.3;
      margin: 0;
      text-align: center;
    }

    .edit-subtitle {
      color: #63746a;
      font-size: 0.8125rem;
      line-height: 1.5;
      margin: 3px 0 0;
      text-align: center;
    }

    .edit-field {
      margin-top: 18px;
    }

    .edit-label {
      color: #314b3f;
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .edit-input-wrap {
      position: relative;
    }

    .edit-input {
      border: 1px solid #dce6df;
      border-radius: 10px;
      box-sizing: border-box;
      color: #14211b;
      font: inherit;
      font-size: 0.875rem;
      height: 42px;
      line-height: 1.4;
      padding: 0 60px 0 12px;
      transition: border-color 150ms ease, box-shadow 150ms ease;
      width: 100%;
    }

    .edit-input::placeholder {
      color: #a0b4a6;
    }

    .edit-input:focus {
      border-color: #1f6f50;
      box-shadow: 0 0 0 3px rgb(31 111 80 / 12%);
      outline: 0;
    }

    .edit-input--error {
      border-color: #b8433a;
    }

    .edit-input--error:focus {
      border-color: #b8433a;
      box-shadow: 0 0 0 3px rgb(184 67 58 / 12%);
    }

    .edit-chars {
      color: #859b8e;
      font-size: 0.6875rem;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      pointer-events: none;
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
    }

    .edit-chars--warn {
      color: #b8433a;
    }

    .edit-error {
      color: #b8433a;
      font-size: 0.75rem;
      line-height: 1.4;
      margin: 5px 0 0;
    }

    .edit-select-wrap {
      align-items: center;
      border: 1px solid #dce6df;
      border-radius: 10px;
      display: flex;
      height: 42px;
      padding: 0 10px;
      position: relative;
    }

    .edit-select-wrap:focus-within {
      border-color: #1f6f50;
      box-shadow: 0 0 0 3px rgb(31 111 80 / 12%);
    }

    .edit-select-emoji {
      flex-shrink: 0;
      font-size: 1rem;
      line-height: 1;
      margin-right: 6px;
    }

    .edit-select {
      appearance: none;
      background: transparent;
      border: 0;
      color: #14211b;
      flex: 1;
      font: inherit;
      font-size: 0.875rem;
      height: 100%;
      outline: 0;
      padding: 0;
    }

    .edit-select-arrow {
      color: #859b8e;
      flex-shrink: 0;
      pointer-events: none;
    }

    .edit-status-group {
      display: flex;
      gap: 16px;
    }

    .edit-status-option {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      font-size: 0.875rem;
      gap: 6px;
      color: #314b3f;
    }

    .edit-status-option input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .edit-status-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid #b6cdbe;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: border-color 120ms ease, background 120ms ease;
    }

    .edit-status-option input:checked + .edit-status-dot {
      border-color: #15803d;
      background: #15803d;
      box-shadow: inset 0 0 0 3px #fff;
    }

    .edit-status-option input:focus-visible + .edit-status-dot {
      box-shadow: 0 0 0 3px rgb(31 111 80 / 20%);
    }

    .edit-actions {
      display: flex;
      justify-content: space-between;
      margin-top: 22px;
    }

    .edit-btn {
      align-items: center;
      border-radius: 10px;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 6px;
      height: 40px;
      justify-content: center;
      line-height: 1;
      padding: 0 18px;
      transition: background 120ms ease, border-color 120ms ease;
    }

    .edit-btn:focus-visible {
      box-shadow: 0 0 0 2px rgb(31 111 80 / 40%);
      outline: 0;
    }

    .edit-btn--secondary {
      background: #ffffff;
      border: 1px solid #dce6df;
      color: #314b3f;
    }

    .edit-btn--secondary:hover {
      background: #f4f9f6;
      border-color: #cbd8d0;
    }

    .edit-btn--primary {
      background: #15803d;
      border: 1px solid #15803d;
      color: #ffffff;
    }

    .edit-btn--primary:hover:not(:disabled) {
      background: #166f38;
      border-color: #166f38;
    }

    .edit-btn--primary:disabled {
      background: #b6cdbe;
      border-color: #b6cdbe;
      cursor: default;
    }
  `],
})
export class EditActivityDialog {
  protected readonly dialogRef = inject(MatDialogRef<EditActivityDialog, EditDialogResult | undefined>);
  protected readonly data = inject<EditActivityDialogData>(MAT_DIALOG_DATA);

  protected readonly MAX_NAME_LENGTH = MAX_NAME_LENGTH;
  protected readonly SPORT_TYPES = SPORT_TYPES;
  protected readonly formatSportType = formatSportType;

  protected name = this.data.currentName;
  protected readonly sportType = signal(this.data.currentSportType);
  protected activityStatus: ActivityStatus = this.data.currentActivityStatus;
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

  protected canSave = (): boolean => {
    const trimmed = this.name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return false;
    if (trimmed !== this.data.currentName) return true;
    if (this.sportType() !== this.data.currentSportType) return true;
    if (this.activityStatus !== this.data.currentActivityStatus) return true;
    return false;
  };

  protected onInput(): void {
    const trimmed = this.name.trim();
    if (trimmed.length === 0) {
      this.error.set('Name cannot be empty');
    } else if (this.name.length > MAX_NAME_LENGTH) {
      this.error.set('Name must be 50 characters or fewer');
    } else {
      this.error.set(null);
    }
  }

  protected onSave(): void {
    const trimmed = this.name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return;
    this.dialogRef.close({
      name: trimmed,
      sportType: this.sportType(),
      activityStatus: this.activityStatus,
    });
  }

  protected sportTypeEmoji(sportType: string): string {
    return SPORT_TYPE_EMOJI[sportType] ?? '🏋️';
  }
}

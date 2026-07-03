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
  templateUrl: './edit-activity-dialog.component.html',
  styleUrl: './edit-activity-dialog.component.scss',
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

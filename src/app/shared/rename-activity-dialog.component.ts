import { Component, inject, signal, viewChild, ElementRef, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { IconComponent } from './icon.component';

export interface RenameActivityDialogData {
  currentName: string;
}

const MAX_NAME_LENGTH = 50;

@Component({
  selector: 'app-rename-activity-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule, IconComponent],
  template: `
    <div class="rename-overlay" (click)="dialogRef.close()">
      <div class="rename-dialog" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="rename-title">
        <button class="rename-close" type="button" (click)="dialogRef.close()" aria-label="Close dialog">
          <app-icon name="x" [size]="14" strokeWidth="2"></app-icon>
        </button>

        <div class="rename-icon">
          <app-icon name="pencil" [size]="20" strokeWidth="2"></app-icon>
        </div>

        <h2 class="rename-title" id="rename-title">Rename activity</h2>
        <p class="rename-subtitle">Give your activity a new name</p>

        <div class="rename-field">
          <label class="rename-label" for="rename-input">Activity name</label>
          <div class="rename-input-wrap">
            <input
              id="rename-input"
              class="rename-input"
              [class.rename-input--error]="!!errorMessage()"
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
              class="rename-chars"
              [class.rename-chars--warn]="name.length >= MAX_NAME_LENGTH"
            >{{ name.length }}/{{ MAX_NAME_LENGTH }}</span>
          </div>
          @if (errorMessage(); as msg) {
            <p class="rename-error" role="alert">{{ msg }}</p>
          }
        </div>

        <div class="rename-actions">
          <button class="rename-btn rename-btn--secondary" type="button" (click)="dialogRef.close()">Cancel</button>
          <button class="rename-btn rename-btn--primary" type="button" [disabled]="!canSave()" (click)="onSave()">
            <app-icon name="check-circle" [size]="14" strokeWidth="2"></app-icon>
            Save changes
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .rename-overlay {
      align-items: center;
      background: rgb(20 33 27 / 35%);
      backdrop-filter: blur(3px);
      display: flex;
      inset: 0;
      justify-content: center;
      position: fixed;
      z-index: 1000;
    }

    .rename-dialog {
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgb(20 33 27 / 14%);
      box-sizing: border-box;
      max-width: 370px;
      padding: 28px;
      position: relative;
      width: 100%;
      animation: rename-in 150ms ease-out;
    }

    @keyframes rename-in {
      from {
        opacity: 0;
        transform: scale(0.96) translateY(6px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .rename-close {
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

    .rename-close:hover {
      background: #eef5f0;
      color: #14211b;
    }

    .rename-close:focus-visible {
      box-shadow: 0 0 0 2px rgb(31 111 80 / 40%);
      outline: 0;
    }

    .rename-icon {
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

    .rename-title {
      color: #14211b;
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.3;
      margin: 0;
      text-align: center;
    }

    .rename-subtitle {
      color: #63746a;
      font-size: 0.8125rem;
      line-height: 1.5;
      margin: 3px 0 0;
      text-align: center;
    }

    .rename-field {
      margin-top: 18px;
    }

    .rename-label {
      color: #314b3f;
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .rename-input-wrap {
      position: relative;
    }

    .rename-input {
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

    .rename-input::placeholder {
      color: #a0b4a6;
    }

    .rename-input:focus {
      border-color: #1f6f50;
      box-shadow: 0 0 0 3px rgb(31 111 80 / 12%);
      outline: 0;
    }

    .rename-input--error {
      border-color: #b8433a;
    }

    .rename-input--error:focus {
      border-color: #b8433a;
      box-shadow: 0 0 0 3px rgb(184 67 58 / 12%);
    }

    .rename-chars {
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

    .rename-chars--warn {
      color: #b8433a;
    }

    .rename-error {
      color: #b8433a;
      font-size: 0.75rem;
      line-height: 1.4;
      margin: 5px 0 0;
    }

    .rename-actions {
      display: flex;
      justify-content: space-between;
      margin-top: 22px;
    }

    .rename-btn {
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

    .rename-btn:focus-visible {
      box-shadow: 0 0 0 2px rgb(31 111 80 / 40%);
      outline: 0;
    }

    .rename-btn--secondary {
      background: #ffffff;
      border: 1px solid #dce6df;
      color: #314b3f;
    }

    .rename-btn--secondary:hover {
      background: #f4f9f6;
      border-color: #cbd8d0;
    }

    .rename-btn--primary {
      background: #15803d;
      border: 1px solid #15803d;
      color: #ffffff;
    }

    .rename-btn--primary:hover:not(:disabled) {
      background: #166f38;
      border-color: #166f38;
    }

    .rename-btn--primary:disabled {
      background: #b6cdbe;
      border-color: #b6cdbe;
      cursor: default;
    }
  `],
})
export class RenameActivityDialog {
  protected readonly dialogRef = inject(MatDialogRef<RenameActivityDialog, string | undefined>);
  protected readonly data = inject<RenameActivityDialogData>(MAT_DIALOG_DATA);

  protected readonly MAX_NAME_LENGTH = MAX_NAME_LENGTH;
  protected name = this.data.currentName;
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
    return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH && trimmed !== this.data.currentName;
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
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH || trimmed === this.data.currentName) {
      return;
    }
    this.dialogRef.close(trimmed);
  }
}

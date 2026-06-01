import { Component, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    @if (message(); as msg) {
      <div class="toast-overlay">
        <div class="toast" role="alert">
          <span class="toast-msg">{{ msg }}</span>
          <button class="toast-close" type="button" (click)="dismiss()" aria-label="Dismiss notification">&times;</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .toast-overlay {
      align-items: flex-start;
      display: flex;
      justify-content: flex-end;
      left: 0;
      pointer-events: none;
      position: fixed;
      top: 0;
      width: 100%;
      z-index: 1000;
    }

    .toast {
      align-items: center;
      background: #14211b;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgb(20 33 27 / 25%);
      color: #ffffff;
      display: flex;
      font-size: 0.875rem;
      font-weight: 600;
      gap: 12px;
      margin: 12px 12px 0;
      max-width: 400px;
      padding: 12px 16px;
      pointer-events: auto;
    }

    .toast-msg {
      flex: 1;
      line-height: 1.4;
    }

    .toast-close {
      align-items: center;
      background: transparent;
      border: 0;
      color: #a0b4a6;
      cursor: pointer;
      display: inline-flex;
      font-size: 1.25rem;
      font-weight: 400;
      justify-content: center;
      line-height: 1;
      min-height: 28px;
      min-width: 28px;
      padding: 0;
    }

    .toast-close:hover {
      color: #ffffff;
    }
  `],
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);
  protected readonly message = signal<string | null>(null);
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.toastService.toast$.subscribe((t) => {
      if (this.timeoutId) clearTimeout(this.timeoutId);
      this.message.set(t ? t.message : null);
      if (t) {
        this.timeoutId = setTimeout(() => this.dismiss(), 3000);
      }
    });
  }

  protected dismiss(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.message.set(null);
  }
}

import { Component, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
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
        this.timeoutId = setTimeout(() => this.dismiss(), t.durationMs ?? 3000);
      }
    });
  }

  protected dismiss(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.message.set(null);
  }
}

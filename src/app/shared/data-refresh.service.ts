import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DataRefreshService {
  readonly refresh$ = new Subject<void>();
  readonly syncInProgress = signal(false);
  readonly syncProgressLabel = signal<string | null>(null);

  emitRefresh(): void {
    this.refresh$.next();
  }

  startSync(label: string): void {
    this.syncInProgress.set(true);
    this.syncProgressLabel.set(label);
  }

  completeSync(): void {
    this.syncInProgress.set(false);
    this.syncProgressLabel.set(null);
    this.emitRefresh();
  }
}

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DataRefreshService {
  readonly refresh$ = new Subject<void>();
  emitRefresh(): void {
    this.refresh$.next();
  }
}

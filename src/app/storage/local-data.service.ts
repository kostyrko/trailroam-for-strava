import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';

@Injectable({
  providedIn: 'root',
})
export class LocalDataService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  async clearSyncedLocalData(): Promise<void> {
    await Promise.all([
      this.repositories.activities.clear(),
      this.repositories.activityRoutes.clear(),
      this.repositories.syncState.clear(),
    ]);
  }
}

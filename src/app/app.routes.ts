import { Component, inject, signal } from '@angular/core';
import { Routes } from '@angular/router';
import { ActivitiesPageComponent } from './activities/activities-page.component';
import { MapPage } from './map/map-page.component';
import { LocalDataService } from './storage/local-data.service';

@Component({
  selector: 'app-settings-page',
  template: `
    <section class="route-page" aria-labelledby="settings-title">
      <p class="eyebrow">Settings</p>
      <h1 id="settings-title">Settings</h1>
      <p>Manage local extension data stored in this browser.</p>

      <article class="empty-state danger-state" aria-labelledby="clear-local-data-title">
        <p class="empty-state-kicker">Local data</p>
        <h2 id="clear-local-data-title">Clear synced local data</h2>
        <p>
          This removes imported activities, routes, and sync state from this browser. Settings and access state are kept.
        </p>
        <button
          class="danger-action"
          type="button"
          [disabled]="isClearingLocalData()"
          (click)="clearSyncedLocalData()"
        >
          {{ isClearingLocalData() ? 'Clearing local data...' : 'Clear synced local data' }}
        </button>

        @if (clearLocalDataStatus()) {
          <p class="route-state" role="status">{{ clearLocalDataStatus() }}</p>
        }
      </article>
    </section>
  `,
})
export class SettingsPage {
  private readonly localDataService = inject(LocalDataService);

  protected readonly isClearingLocalData = signal(false);
  protected readonly clearLocalDataStatus = signal<string | null>(null);

  protected async clearSyncedLocalData(): Promise<void> {
    const confirmed = window.confirm(
      'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
    );

    if (!confirmed) {
      return;
    }

    this.isClearingLocalData.set(true);
    this.clearLocalDataStatus.set(null);

    try {
      await this.localDataService.clearSyncedLocalData();
      this.clearLocalDataStatus.set('Imported activities, routes, and sync state were cleared.');
    } finally {
      this.isClearingLocalData.set(false);
    }
  }
}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'map',
  },
  {
    path: 'activities',
    component: ActivitiesPageComponent,
  },
  {
    path: 'map',
    component: MapPage,
  },
  {
    path: 'settings',
    component: SettingsPage,
  },
  {
    path: '**',
    redirectTo: 'map',
  },
];

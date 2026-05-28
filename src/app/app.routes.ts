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

      <article class="empty-state" aria-labelledby="sync-data-title">
        <p class="empty-state-kicker">Sync</p>
        <h2 id="sync-data-title">Sync new activities</h2>
        <p>Import new or updated Strava activities and their GPS routes.</p>
        <button class="primary-action" type="button">Sync new activities</button>
      </article>

      <article class="empty-state" aria-labelledby="sync-routes-title">
        <p class="empty-state-kicker">Sync</p>
        <h2 id="sync-routes-title">Sync missing routes</h2>
        <p>Retry route import for activities that have no GPS route yet.</p>
        <button class="primary-action" type="button">Sync missing routes</button>
      </article>

      <article class="empty-state danger-state" aria-labelledby="clear-resync-title">
        <p class="empty-state-kicker">Local data</p>
        <h2 id="clear-resync-title">Clear and re-sync</h2>
        <p>This deletes locally synced activities and route data, then imports them again from Strava. Your settings will be kept.</p>
        <button
          class="danger-action"
          type="button"
          [disabled]="isClearingLocalData()"
          (click)="clearAndResync()"
        >
          {{ isClearingLocalData() ? 'Clearing...' : 'Clear and re-sync' }}
        </button>
      </article>

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
          {{ isClearingLocalData() ? 'Clearing...' : 'Clear synced local data' }}
        </button>

        @if (clearLocalDataStatus()) {
          <p class="route-state" role="status">{{ clearLocalDataStatus() }}</p>
        }
      </article>

      <article class="empty-state" aria-labelledby="backup-title">
        <p class="empty-state-kicker">Local data</p>
        <h2 id="backup-title">Backup local data</h2>
        <p>Export your activities, routes, and settings to a JSON file. The backup file may contain GPS route history — store it somewhere private.</p>
        <button class="primary-action" type="button">Backup</button>
      </article>

      <article class="empty-state" aria-labelledby="restore-title">
        <p class="empty-state-kicker">Local data</p>
        <h2 id="restore-title">Restore local data</h2>
        <p>Restore your activities, routes, and settings from a previous backup file. This will replace your current local data.</p>
        <button class="primary-action" type="button">Restore</button>
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

  protected async clearAndResync(): Promise<void> {
    const confirmed = window.confirm(
      'This will delete locally synced activities and route data, then import them again from Strava. Your settings will be kept.',
    );

    if (!confirmed) {
      return;
    }

    this.isClearingLocalData.set(true);
    this.clearLocalDataStatus.set(null);

    try {
      await this.localDataService.clearSyncedLocalData();
      this.clearLocalDataStatus.set('Local data cleared. Opening Strava to re-sync...');
      const c = (globalThis as any).chrome;
      if (c?.tabs?.create) {
        c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
      }
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

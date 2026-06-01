import { Component, inject, signal } from '@angular/core';
import { Routes } from '@angular/router';
import { ActivitiesPageComponent } from './activities/activities-page.component';
import { MapPage } from './map/map-page.component';
import { ConfirmService } from './shared/confirm.service';
import { LocalDataService } from './storage/local-data.service';
import { SyncHistoryService } from './storage/sync-history.service';

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
        <button class="primary-action" type="button" (click)="syncNewActivities()">Sync new activities</button>
      </article>

      <article class="empty-state" aria-labelledby="sync-routes-title">
        <p class="empty-state-kicker">Sync</p>
        <h2 id="sync-routes-title">Sync missing routes</h2>
        <p>Retry route import for activities that have no GPS route yet.</p>
        <button class="primary-action" type="button" (click)="syncMissingRoutes()">Sync missing routes</button>
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
        <button class="primary-action" type="button" (click)="backupLocalData()">Backup</button>
      </article>

      <article class="empty-state" aria-labelledby="restore-title">
        <p class="empty-state-kicker">Local data</p>
        <h2 id="restore-title">Restore local data</h2>
        <p>Restore your activities, routes, and settings from a previous backup file. This will replace your current local data.</p>
        <button class="primary-action" type="button" (click)="restoreLocalData()">Restore</button>
      </article>

      <article class="empty-state" aria-labelledby="sync-history-title">
        <div class="history-header">
          <div>
            <p class="empty-state-kicker">History</p>
            <h2 id="sync-history-title">Sync history</h2>
          </div>
          @if (syncHistory().length > 0) {
            <button class="danger-action history-clear-btn" type="button" (click)="clearSyncHistory()">Clear sync history</button>
          }
        </div>
        @if (syncHistory().length === 0) {
          <p>No syncs have been performed yet.</p>
        } @else {
          <div class="sync-history-scroll">
            <table class="sync-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Activities</th>
                  <th>With routes</th>
                  <th>Without GPS</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of syncHistory(); track entry.id) {
                  <tr>
                    <td>{{ formatDate(entry.completedAt) }}</td>
                    <td class="trigger-cell">{{ formatTrigger(entry.trigger) }}</td>
                    <td>{{ entry.status }}</td>
                    <td>{{ entry.totalActivitiesAfter }}</td>
                    <td>{{ entry.activitiesWithRoutesAfter }}</td>
                    <td>{{ entry.activitiesWithoutRoutesAfter }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </article>
    </section>
  `,
})
export class SettingsPage {
  private readonly localDataService = inject(LocalDataService);
  private readonly confirmService = inject(ConfirmService);
  private readonly syncHistoryService = inject(SyncHistoryService);

  protected readonly isClearingLocalData = signal(false);
  protected readonly clearLocalDataStatus = signal<string | null>(null);
  protected readonly syncHistory = signal<import('./storage/storage.models').SyncHistoryRecord[]>([]);

  constructor() {
    this.loadSyncHistory();
  }

  private async loadSyncHistory(): Promise<void> {
    try {
      this.syncHistory.set(await this.syncHistoryService.list());
    } catch {}
  }

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  protected syncNewActivities(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected syncMissingRoutes(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSyncMissing=true' });
    }
  }

  protected async clearSyncHistory(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Clear sync history',
      message: 'This will delete all sync history entries. The imported activities and routes will not be affected.',
      confirmLabel: 'Clear history',
      danger: true,
    });
    if (!confirmed) { return; }
    await this.syncHistoryService.clear();
    this.syncHistory.set([]);
  }

  protected formatTrigger(trigger: string): string {
    switch (trigger) {
      case 'sync_new_activities': return 'Sync new activities';
      case 'sync_missing_routes': return 'Sync missing routes';
      case 'clear_and_resync': return 'Clear and re-sync';
      case 'clear_synced_local_data': return 'Clear synced local data';
      default: return trigger;
    }
  }

  protected async restoreLocalData(): Promise<void> {
    const file = await this.pickBackupFile();
    if (!file) { return; }
    const json = await file.text();
    let backup: unknown;
    try {
      backup = JSON.parse(json);
    } catch {
      window.alert('Invalid backup file: could not parse JSON.');
      return;
    }
    try {
      this.localDataService.validateBackup(backup);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Invalid backup file.');
      return;
    }
    const confirmed = await this.confirmService.confirm({
      title: 'Restore backup',
      message: 'This will replace all current local data with the backup. Are you sure?',
      confirmLabel: 'Restore backup',
      danger: true,
    });
    if (!confirmed) { return; }
    const result = await this.localDataService.restore(backup as any);
    window.alert(
      `Restored: ${result.settingsCount} settings, ${result.accessStateCount} access state, ${result.syncStateCount} sync state, ${result.activitiesCount} activities, ${result.activityRoutesCount} routes. Refreshing...`,
    );
    window.location.href = 'index.html';
  }

  private pickBackupFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files?.[0] ?? null;
        resolve(file);
      };
      input.click();
    });
  }

  protected async backupLocalData(): Promise<void> {
    const backup = await this.localDataService.backup();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trailroam-backup-${backup.exportedAt.slice(0, 19).replace(/[T:]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async clearSyncedLocalData(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Clear synced local data',
      message: 'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
      confirmLabel: 'Clear data',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.isClearingLocalData.set(true);
    this.clearLocalDataStatus.set(null);

    try {
      await this.localDataService.clearSyncedLocalData();
      await this.syncHistoryService.record('clear_synced_local_data', {
        importedCount: 0,
        updatedCount: 0,
        routesSyncedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        rateLimitedCount: 0,
        status: 'completed',
      });
      this.clearLocalDataStatus.set('Imported activities, routes, and sync state were cleared.');
      this.loadSyncHistory();
    } finally {
      this.isClearingLocalData.set(false);
    }
  }

  protected async clearAndResync(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Clear and re-sync',
      message: 'This will delete locally synced activities and route data, then import them again from Strava. Your settings will be kept.',
      confirmLabel: 'Clear and re-sync',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.isClearingLocalData.set(true);
    this.clearLocalDataStatus.set(null);

    try {
      await this.localDataService.clearSyncedLocalData();
      await this.syncHistoryService.record('clear_and_resync', {
        importedCount: 0,
        updatedCount: 0,
        routesSyncedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        rateLimitedCount: 0,
        status: 'completed',
      });
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

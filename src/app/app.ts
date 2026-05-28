import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SyncSummaryService, type SyncSummary } from './storage/sync-summary.service';
import { LocalDataService } from './storage/local-data.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly syncSummaryService = inject(SyncSummaryService);
  private readonly localDataService = inject(LocalDataService);

  protected readonly syncSummary = signal<SyncSummary | null>(null);
  protected readonly syncMenuOpen = signal(false);
  protected readonly buildDate: string =
    document.documentElement.getAttribute('data-build') ?? 'dev';

  constructor() {
    this.loadSyncSummary();
  }

  protected toggleSyncMenu(): void {
    this.syncMenuOpen.update((v) => !v);
  }

  protected closeSyncMenu(): void {
    this.syncMenuOpen.set(false);
  }

  protected dismissSyncSummary(): void {
    this.syncSummary.set(null);
  }

  protected syncNewActivities(): void {
    this.closeSyncMenu();
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected syncMissingRoutes(): void {
    this.closeSyncMenu();
  }

  protected async clearAndResync(): Promise<void> {
    this.closeSyncMenu();
    const confirmed = window.confirm(
      'This will delete locally synced activities and route data, then import them again from Strava. Your settings will be kept.',
    );
    if (!confirmed) { return; }
    await this.localDataService.clearSyncedLocalData();
    this.syncNewActivities();
  }

  protected async clearSyncedLocalData(): Promise<void> {
    this.closeSyncMenu();
    const confirmed = window.confirm(
      'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
    );
    if (!confirmed) { return; }
    await this.localDataService.clearSyncedLocalData();
  }

  protected async backupLocalData(): Promise<void> {
    this.closeSyncMenu();
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

  protected async restoreLocalData(): Promise<void> {
    this.closeSyncMenu();
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
    const confirmed = window.confirm(
      'This will replace all current local data with the backup. Are you sure?',
    );
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

  protected refreshExtension(): void {
    window.location.href = 'index.html';
  }

  private async loadSyncSummary(): Promise<void> {
    try {
      const summary = await this.syncSummaryService.getSummary();
      this.syncSummary.set(summary.hasResults ? summary : null);
    } catch {
    }
  }
}

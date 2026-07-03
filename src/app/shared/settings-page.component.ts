import { Component, computed, inject, signal } from '@angular/core';
import { ConfirmService } from './confirm.service';
import { ToastService } from './toast.service';
import { IconComponent } from './icon.component';
import { LocalDataService } from '../storage/local-data.service';
import { SyncHistoryService } from '../storage/sync-history.service';
import { TRAILROAM_DATABASE, TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { DataRefreshService } from './data-refresh.service';
import { DATABASE_SCHEMA_VERSION } from '../storage/storage.models';

@Component({
  imports: [IconComponent],
  selector: 'app-settings-page',
  styleUrl: './settings-page.component.scss',
  templateUrl: './settings-page.component.html',
})
export class SettingsPage {
  private readonly localDataService = inject(LocalDataService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly syncHistoryService = inject(SyncHistoryService);
  private readonly database = inject(TRAILROAM_DATABASE);

  protected readonly dbVersion = this.database.verno;
  protected readonly latestDbVersion = DATABASE_SCHEMA_VERSION;
  protected readonly dbOutdated = this.dbVersion < DATABASE_SCHEMA_VERSION;

  protected readonly isClearingLocalData = signal(false);
  protected readonly clearLocalDataStatus = signal<string | null>(null);
  protected readonly syncHistory = signal<import('../storage/storage.models').SyncHistoryRecord[]>([]);
  protected readonly expandedHistory = signal(false);
  private readonly DISPLAY_LIMIT = 5;

  protected readonly displayedHistory = computed(() => {
    const all = this.syncHistory();
    return this.expandedHistory() ? all : all.slice(0, this.DISPLAY_LIMIT);
  });

  protected readonly showViewFull = computed(() => {
    return !this.expandedHistory() && this.syncHistory().length > this.DISPLAY_LIMIT;
  });

  protected toggleFullHistory(): void {
    this.expandedHistory.update((v) => !v);
  }

  private readonly syncInProgressReadonly = computed(() => this.dataRefresh.syncInProgress());
  protected get syncInProgress(): boolean {
    return this.syncInProgressReadonly();
  }

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
      case 'sync_new_activities': return 'Sync activities';
      case 'sync_missing_routes': return 'Sync missing routes';
      case 'clear_and_resync': return 'Clear and re-sync';
      case 'clear_synced_local_data': return 'Clear synced local data';
      case 'backup_local_data': return 'Backup local data';
      case 'restore_local_data': return 'Restore local data';
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
      this.toastService.show('Invalid backup file: could not parse JSON.');
      return;
    }
    try {
      this.localDataService.validateBackup(backup);
    } catch (err) {
      this.toastService.show(err instanceof Error ? err.message : 'Invalid backup file.');
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
    this.toastService.show(`Restored: ${result.settingsCount} settings, ${result.accessStateCount} access state, ${result.syncStateCount} sync state, ${result.activitiesCount} activities, ${result.activityRoutesCount} routes.`);
    await this.syncHistoryService.record('restore_local_data', {
      importedCount: 0, updatedCount: 0, routesSyncedCount: 0, skippedCount: 0, failedCount: 0, rateLimitedCount: 0, status: 'completed',
    });
    this.loadSyncHistory();
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
    this.toastService.show(`Backup: ${backup.settings.length} settings, ${backup.accessState.length} access state, ${backup.syncState.length} sync state, ${backup.activities.length} activities, ${backup.activityRoutes.length} routes.`);
    await this.syncHistoryService.record('backup_local_data', {
      importedCount: 0, updatedCount: 0, routesSyncedCount: 0, skippedCount: 0, failedCount: 0, rateLimitedCount: 0, status: 'completed',
    });
    this.loadSyncHistory();
  }

  protected async clearSyncedLocalData(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Clear synced local data',
      message: 'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
      confirmLabel: 'Clear data',
      danger: true,
    });

    if (!confirmed) { return; }

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

    if (!confirmed) { return; }

    this.isClearingLocalData.set(true);
    this.clearLocalDataStatus.set('Clearing synced data...');

    try {
      await Promise.all([
        this.repositories.activities.clear(),
        this.repositories.activityRoutes.clear(),
        this.repositories.syncState.clear(),
      ]);
      this.clearLocalDataStatus.set('Opening Strava to sync...');
      this.dataRefresh.startSync('Syncing...');
      const c = (globalThis as any).chrome;
      if (c?.tabs?.create) {
        c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
      }
    } finally {
      this.isClearingLocalData.set(false);
    }
  }

  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly dataRefresh = inject(DataRefreshService);
}

import { Component, inject, signal } from '@angular/core';
import { Routes } from '@angular/router';
import { ActivitiesPageComponent } from './activities/activities-page.component';
import { MapPage } from './map/map-page.component';
import { ConfirmService } from './shared/confirm.service';
import { ToastService } from './shared/toast.service';
import { LocalDataService } from './storage/local-data.service';
import { SyncHistoryService } from './storage/sync-history.service';

@Component({
  selector: 'app-settings-page',
  styles: [`
    :host { display: block; background: #f7f8f7; min-height: 100vh; }
    .settings-page { max-width: 1280px; margin: 0 auto; padding: 32px 24px 48px; }
    .settings-title { font-size: 32px; font-weight: 700; color: #111827; margin: 0 0 4px; }
    .settings-subtitle { font-size: 15px; color: #6b7280; margin: 0 0 32px; }
    .settings-layout { display: flex; gap: 24px; align-items: flex-start; }
    .settings-main { flex: 1; min-width: 0; }
    .settings-sidebar { width: 320px; flex-shrink: 0; position: sticky; top: 24px; }
    .section-title { font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 16px; }
    .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .action-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; min-height: 180px; position: relative; }
    .action-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .action-card-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #0f766e; text-transform: uppercase; }
    .action-card-icon { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .action-card-icon-green { background: #e8f5ec; }
    .action-card-icon-red { background: #fdecec; }
    .action-card-icon svg { color: #15803d; }
    .action-card-icon-red svg { color: #dc2626; }
    .action-card-title { font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 8px; }
    .action-card-desc { font-size: 14px; color: #6b7280; line-height: 1.5; margin: 0; flex: 1; }
    .action-card-bottom { margin-top: 16px; }
    .connected-row { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #15803d; margin-top: 4px; }
    .connected-dot { width: 8px; height: 8px; border-radius: 50%; background: #15803d; flex-shrink: 0; }
    .btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 14px; font-weight: 600; height: 36px; padding: 0 16px; cursor: pointer; border: none; font-family: inherit; transition: background 0.15s; }
    .btn-primary { background: #15803d; color: #ffffff; }
    .btn-primary:hover { background: #166534; }
    .btn-danger { background: #ffffff; color: #dc2626; border: 1px solid #dc2626; }
    .btn-danger:hover { background: #fef2f2; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .history-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
    .history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .history-title { font-size: 18px; font-weight: 600; color: #111827; margin: 0; }
    .privacy-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
    .privacy-title { font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 2px; }
    .privacy-subtitle { font-size: 14px; color: #6b7280; margin: 0 0 16px; }
    .privacy-highlight { background: #eef8f0; border-radius: 8px; padding: 16px; display: flex; gap: 12px; margin-bottom: 16px; }
    .privacy-highlight-icon { width: 20px; height: 20px; color: #15803d; flex-shrink: 0; margin-top: 1px; }
    .privacy-highlight-title { font-size: 14px; font-weight: 600; color: #111827; margin: 0 0 2px; }
    .privacy-highlight-text { font-size: 13px; color: #6b7280; margin: 0; line-height: 1.5; }
    .privacy-row { display: flex; gap: 10px; margin-bottom: 14px; }
    .privacy-row:last-of-type { margin-bottom: 0; }
    .privacy-row-icon { width: 18px; height: 18px; color: #9ca3af; flex-shrink: 0; margin-top: 2px; }
    .privacy-row-text { font-size: 13px; color: #6b7280; line-height: 1.5; margin: 0; }
    .tip-box { background: #fff8e6; border-radius: 8px; padding: 14px; display: flex; gap: 10px; margin-top: 16px; }
    .tip-icon { width: 18px; height: 18px; color: #b8860b; flex-shrink: 0; margin-top: 1px; }
    .tip-title { font-size: 13px; font-weight: 600; color: #92400e; margin: 0 0 2px; }
    .tip-text { font-size: 13px; color: #92400e; margin: 0; line-height: 1.5; }
    .sync-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .sync-table th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
    .sync-table td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    .sync-table tbody tr:hover { background: #f9fafb; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
    .status-dot-green { background: #15803d; }
    .status-dot-amber { background: #d97706; }
    .status-dot-red { background: #dc2626; }
    .view-full-btn { display: block; margin: 16px auto 0; background: transparent; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; font-size: 14px; font-weight: 500; height: 36px; padding: 0 16px; cursor: pointer; font-family: inherit; }
    .view-full-btn:hover { background: #f9fafb; }
    .no-history { font-size: 14px; color: #9ca3af; margin: 0; }
    .clear-status { font-size: 14px; color: #15803d; margin-top: 12px; }
    @media (max-width: 911px) {
      .settings-layout { flex-direction: column; }
      .settings-sidebar { width: 100%; position: static; }
      .action-grid { grid-template-columns: 1fr; }
    }
  `],
  template: `
    <div class="settings-page">
      <h1 class="settings-title">Settings</h1>
      <p class="settings-subtitle">Manage your local extension data and synchronization.</p>

      <div class="settings-layout">
        <div class="settings-main">

          <h2 class="section-title">Sync</h2>
          <div class="action-grid">
            <article class="action-card">
              <div class="action-card-top">
                <span class="action-card-label">SYNC</span>
                <div class="action-card-icon action-card-icon-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                </div>
              </div>
              <h3 class="action-card-title">Sync activities</h3>
              <p class="action-card-desc">Import new Strava activities and their GPS routes.</p>
              <div class="action-card-bottom">
                <button class="btn btn-primary" type="button" (click)="syncNewActivities()">Sync activities</button>
              </div>
            </article>

            <article class="action-card">
              <div class="action-card-top">
                <span class="action-card-label">SYNC</span>
                <div class="action-card-icon action-card-icon-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </div>
              </div>
              <h3 class="action-card-title">Sync missing routes</h3>
              <p class="action-card-desc">Retry route import for activities that have no GPS route yet.</p>
              <div class="action-card-bottom">
                <button class="btn btn-primary" type="button" (click)="syncMissingRoutes()">Sync missing routes</button>
              </div>
            </article>
          </div>

          <h2 class="section-title">Data Management</h2>
          <div class="action-grid">
            <article class="action-card">
              <div class="action-card-top">
                <span class="action-card-label">DATA</span>
                <div class="action-card-icon action-card-icon-red">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </div>
              </div>
              <h3 class="action-card-title">Clear and re-sync</h3>
              <p class="action-card-desc">Deletes locally synced tours and route data, then imports them again.</p>
              <div class="action-card-bottom">
                <button class="btn btn-danger" type="button" [disabled]="isClearingLocalData()" (click)="clearAndResync()">{{ isClearingLocalData() ? 'Clearing...' : 'Clear and re-sync' }}</button>
              </div>
            </article>

            <article class="action-card">
              <div class="action-card-top">
                <span class="action-card-label">DATA</span>
                <div class="action-card-icon action-card-icon-red">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </div>
              </div>
              <h3 class="action-card-title">Clear synced local data</h3>
              <p class="action-card-desc">Removes imported activities, routes, and sync state from this browser.</p>
              <div class="action-card-bottom">
                <button class="btn btn-danger" type="button" [disabled]="isClearingLocalData()" (click)="clearSyncedLocalData()">{{ isClearingLocalData() ? 'Clearing...' : 'Clear synced local data' }}</button>
                @if (clearLocalDataStatus()) {
                  <p class="clear-status" role="status">{{ clearLocalDataStatus() }}</p>
                }
              </div>
            </article>

            <article class="action-card">
              <div class="action-card-top">
                <span class="action-card-label">DATA</span>
                <div class="action-card-icon action-card-icon-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </div>
              </div>
              <h3 class="action-card-title">Backup local data</h3>
              <p class="action-card-desc">Export your activities, routes, and settings to a JSON file.</p>
              <div class="action-card-bottom">
                <button class="btn btn-primary" type="button" (click)="backupLocalData()">Backup</button>
              </div>
            </article>

            <article class="action-card">
              <div class="action-card-top">
                <span class="action-card-label">DATA</span>
                <div class="action-card-icon action-card-icon-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
              </div>
              <h3 class="action-card-title">Restore local data</h3>
              <p class="action-card-desc">Restore activities, routes, and settings from a previous backup.</p>
              <div class="action-card-bottom">
                <button class="btn btn-primary" type="button" (click)="restoreLocalData()">Restore</button>
              </div>
            </article>
          </div>

          <div class="history-card">
            <div class="history-header">
              <h2 class="history-title">Sync History</h2>
              @if (syncHistory().length > 0) {
                <button class="btn btn-danger" type="button" (click)="clearSyncHistory()">Clear sync history</button>
              }
            </div>
            @if (syncHistory().length === 0) {
              <p class="no-history">No syncs have been performed yet.</p>
            } @else {
              <table class="sync-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Activities</th>
                    <th>With routes</th>
                  </tr>
                </thead>
                <tbody>
                  @for (entry of syncHistory(); track entry.id) {
                    <tr>
                      <td>{{ formatDate(entry.completedAt) }}</td>
                      <td>{{ formatTrigger(entry.trigger) }}</td>
                      <td>
                        <span class="status-dot status-dot-green"></span>{{ entry.status }}
                      </td>
                      <td>{{ entry.totalActivitiesAfter }}</td>
                      <td>{{ entry.activitiesWithRoutesAfter }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <button class="view-full-btn" type="button">View full history</button>
            }
          </div>

        </div>

        <aside class="settings-sidebar">
          <div class="privacy-card">
            <h2 class="privacy-title">Privacy &amp; Data</h2>
            <p class="privacy-subtitle">Your data is stored locally in this browser.</p>

            <div class="privacy-highlight">
              <svg class="privacy-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <div>
                <p class="privacy-highlight-title">Your data stays private</p>
                <p class="privacy-highlight-text">All data is stored locally and never sent to our servers.</p>
              </div>
            </div>

            <div class="privacy-row">
              <svg class="privacy-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              <p class="privacy-row-text">Imported tours and GPS routes are stored only in the browser's IndexedDB.</p>
            </div>

            <div class="privacy-row">
              <svg class="privacy-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <p class="privacy-row-text">No route or tour data is uploaded to TrailRoam servers.</p>
            </div>

            <div class="privacy-row">
              <svg class="privacy-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <p class="privacy-row-text">Stored data can be inspected using browser developer tools.</p>
            </div>

            <div class="tip-box">
              <svg class="tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>
              <div>
                <p class="tip-title">Tip</p>
                <p class="tip-text">Regularly back up your data to avoid accidental loss.</p>
              </div>
            </div>

          </div>
        </aside>

      </div>
    </div>
  `,
})
export class SettingsPage {
  private readonly localDataService = inject(LocalDataService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
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

import { Component, computed, Inject, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { IconComponent } from './shared/icon.component';
import { ConfirmService } from './shared/confirm.service';
import { ToastComponent } from './shared/toast.component';
import { ToastService } from './shared/toast.service';
import { SyncSummaryService, type SyncSummary } from './storage/sync-summary.service';
import { SyncHistoryService, type SyncTrigger } from './storage/sync-history.service';
import { LocalDataService } from './storage/local-data.service';
import { TRAILROAM_REPOSITORIES } from './storage/repositories/repositories.token';
import { StravaActivityNormalizer } from './strava/strava-activity-normalizer';
import { StravaSessionService } from './strava/strava-session.service';
import { StravaRouteNormalizer } from './strava/strava-route-normalizer';
import { SyncEngineService, type SyncNewResult } from './sync/sync-engine.service';
import { DataRefreshService } from './shared/data-refresh.service';
import type { StravaActivityResponse } from './strava/strava-session.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastComponent, IconComponent, MatDialogModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly syncSummaryService = inject(SyncSummaryService);
  private readonly localDataService = inject(LocalDataService);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly activityNormalizer = inject(StravaActivityNormalizer);
  private readonly stravaSessionService = inject(StravaSessionService);
  private readonly routeNormalizer = inject(StravaRouteNormalizer);
  private readonly syncEngine = inject(SyncEngineService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly syncHistoryService = inject(SyncHistoryService);
  private readonly dialog = inject(MatDialog);

  private pendingRouteCount = 0;
  private totalRouteCount = 0;
  private runningStoreCount = { activities: 0, routes: 0, noRoutes: 0 };
  private importHistoryRecorded = false;
  private pendingHistoryTrigger: 'sync_new_activities' | 'clear_and_resync' = 'sync_new_activities';
  private storeQueue = Promise.resolve();

  protected readonly syncSummary = signal<SyncSummary | null>(null);
  protected readonly syncMenuOpen = signal(false);
  protected readonly lastSyncLabel = signal<string | null>(null);
  protected readonly syncInProgress = computed(() => this.dataRefresh.syncInProgress());
  protected readonly syncProgressLabel = computed(() => this.dataRefresh.syncProgressLabel());
  protected readonly buildDate: string =
    document.documentElement.getAttribute('data-build') ?? 'dev';
  protected readonly appMenuOpen = signal(false);
  protected readonly extVersion: string = (globalThis as any).chrome?.runtime?.getManifest?.()?.version ?? 'dev';

  constructor() {
    this.loadSyncSummary();
    this.loadLastSyncLabel();
    this.listenForMessages();
    globalThis.addEventListener('click', () => { this.closeSyncMenu(); this.appMenuOpen.set(false); });
  }

  private async loadLastSyncLabel(): Promise<void> {
    try {
      const syncState = await this.repositories.syncState.get();
      if (syncState?.lastSuccessfulSyncAt) {
        const date = new Date(syncState.lastSuccessfulSyncAt);
        const formatted = date.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        this.lastSyncLabel.set(formatted);
      } else {
        this.lastSyncLabel.set(null);
      }
    } catch {
      this.lastSyncLabel.set(null);
    }
  }

  private listenForMessages(): void {
    const c = (globalThis as any).chrome;
    if (!c?.runtime?.onMessage) { return; }
    console.log('[Trailroam] Registering runtime message listener');
    c.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any) => {
      console.log('[Trailroam] Runtime message received', msg?.type, msg?.payload ? '(has payload)' : '(no payload)');
      if (msg?.type === 'TRAILROAM_SYNC_DONE') {
        console.log('[Trailroam] Sync done notification received');
        this.loadSyncSummary();
        this.loadLastSyncLabel();
        this.completeSync();
        return undefined;
      }
      if (msg?.type === 'TRAILROAM_GET_MISSING_ACTIVITIES') {
        this.sendMissingActivityIds(sendResponse);
        return true;
      }
      if (msg?.type === 'TRAILROAM_GET_SYNCED_IDS') {
        this.sendSyncedIds(sendResponse);
        return true;
      }
      if (msg?.type === 'TRAILROAM_STORE_ACTIVITIES') {
        console.log('[Trailroam] Store activities received, activities:', msg.payload?.activities?.length ?? 0, 'routes:', msg.payload?.routes?.length ?? 0);
        this.dataRefresh.syncProgressLabel.set('Storing data...');
        this.storeQueue = this.storeQueue.then(() => this.storeImportedData(msg.payload));
      }
      return undefined;
    });
  }

  private async storeImportedData(payload: any): Promise<void> {
    const now = new Date().toISOString();
    const rawActivities: StravaActivityResponse[] = payload?.activities ?? [];
    const rawRoutes: Array<{ activityId: number; routeData: any }> = payload?.routes ?? [];

    const hasFinalBatch = payload?.isFinalBatch === true;

    if (rawActivities.length === 0 && rawRoutes.length === 0) {
      this.completeSync();
      return;
    }

    this.totalRouteCount += rawRoutes.length;

    for (const raw of rawActivities) {
      if (raw.distance !== undefined) {
        raw.distance *= 1000;
      }
      if (typeof raw.moving_time === 'string') {
        const parts = (raw.moving_time as string).split(':');
        if (parts.length === 3) {
          raw.moving_time = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]) as any;
        } else if (parts.length === 2) {
          raw.moving_time = Number(parts[0]) * 60 + Number(parts[1]) as any;
        }
      }
      if (typeof raw.elapsed_time === 'string') {
        const parts = (raw.elapsed_time as string).split(':');
        if (parts.length === 3) {
          raw.elapsed_time = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]) as any;
        } else if (parts.length === 2) {
          raw.elapsed_time = Number(parts[0]) * 60 + Number(parts[1]) as any;
        }
      }
      const activity = this.activityNormalizer.normalize(raw);
      activity.importedAt = now;
      activity.updatedAt = now;
      await this.repositories.activities.put(activity);
      this.runningStoreCount.activities++;
    }

    for (const item of rawRoutes) {
      const rawRoute = item.routeData;
      const activityId = String(item.activityId);

      if (rawRoute && rawRoute.latlng && Array.isArray(rawRoute.latlng.data) && rawRoute.latlng.data.length > 0) {
        const validCoords: [number, number][] = [];
        for (const coord of rawRoute.latlng.data) {
          const lat = coord[0] as number;
          const lng = coord[1] as number;
          if (Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
            validCoords.push([lng, lat]);
          }
        }
        if (validCoords.length >= 2) {
          const elevations: number[] | undefined =
            rawRoute.altitude && Array.isArray(rawRoute.altitude.data)
              ? rawRoute.altitude.data
              : undefined;
          const cumulativeDistances: number[] | undefined =
            rawRoute.distance && Array.isArray(rawRoute.distance.data)
              ? rawRoute.distance.data
              : undefined;
          const route = {
            activityId: 'strava:' + activityId,
            providerActivityId: activityId,
            coordinates: validCoords,
            pointCount: validCoords.length,
            elevations,
            cumulativeDistances,
            syncedAt: now,
            updatedAt: now,
          };
          await this.repositories.activityRoutes.put(route);

          const existing = await this.repositories.activities.get('strava:' + activityId);
          if (existing) {
            existing.hasRoute = true;
            existing.routeSyncStatus = 'route_synced';
            existing.updatedAt = now;
            await this.repositories.activities.put(existing);
          }
          this.runningStoreCount.routes++;
        } else {
          this.runningStoreCount.noRoutes++;
        }
      } else {
        this.runningStoreCount.noRoutes++;
      }

      this.pendingRouteCount++;
    }

    const allRoutesDone = (this.totalRouteCount > 0 && this.pendingRouteCount >= this.totalRouteCount) || hasFinalBatch;

    if (rawActivities.length > 0) {
      await this.repositories.syncState.put({
        id: 'default',
        status: 'completed',
        completedAt: now,
        lastSuccessfulSyncAt: now,
        startedAt: now,
        importedCount: this.runningStoreCount.activities,
        updatedCount: 0,
        routesSyncedCount: 0,
        skippedCount: 0,
        failedCount: 0,
      });
    }

    if (allRoutesDone) {
      const attempts = await this.retryMissingRoutes();
      await this.repositories.syncState.put({
        id: 'default',
        status: 'completed',
        completedAt: now,
        lastSuccessfulSyncAt: now,
        startedAt: now,
        importedCount: this.runningStoreCount.activities,
        updatedCount: 0,
        routesSyncedCount: this.runningStoreCount.routes + attempts.synced,
        skippedCount: this.runningStoreCount.noRoutes + attempts.skipped,
        failedCount: attempts.failed,
      });

      if (!this.importHistoryRecorded) {
        this.importHistoryRecorded = true;
        await this.syncHistoryService.record(this.pendingHistoryTrigger, {
          importedCount: this.runningStoreCount.activities,
          updatedCount: 0,
          routesSyncedCount: this.runningStoreCount.routes + attempts.synced,
          skippedCount: this.runningStoreCount.noRoutes + attempts.skipped,
          failedCount: attempts.failed,
          rateLimitedCount: 0,
          status: 'completed',
        });
      }
      this.loadSyncSummary();
      this.loadLastSyncLabel();
      this.dataRefresh.emitRefresh();
      this.completeSync();
    }

    if (!allRoutesDone && rawRoutes.length > 0) {
      this.dataRefresh.syncProgressLabel.set('Storing routes...');
    }
  }

  protected formatTimestamp(iso: string): string {
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  private startSyncProgress(label: string): void {
    this.dataRefresh.startSync(label);
  }

  private completeSync(): void {
    this.dataRefresh.completeSync();
  }

  private resetCounters(): void {
    this.pendingRouteCount = 0;
    this.totalRouteCount = 0;
    this.runningStoreCount = { activities: 0, routes: 0, noRoutes: 0 };
    this.importHistoryRecorded = false;
    this.pendingHistoryTrigger = 'sync_new_activities';
    this.syncSummary.set(null);
  }

  private async sendSyncedIds(sendResponse: (response: any) => void): Promise<void> {
    const activities = await this.repositories.activities.list();
    const ids = new Set(activities.map((a) => a.providerActivityId));
    const routeSyncedIds = new Set(
      activities.filter((a) => a.routeSyncStatus === 'route_synced').map((a) => a.providerActivityId),
    );
    sendResponse({ syncedIds: [...ids], routeSyncedIds: [...routeSyncedIds] });
  }

  private async sendMissingActivityIds(sendResponse: (response: any) => void): Promise<void> {
    const activities = await this.repositories.activities.list();
    const needing = activities
      .filter((a) => a.routeSyncStatus !== 'route_synced')
      .map((a) => a.providerActivityId);
    sendResponse({ activityIds: needing });
  }

  private async retryMissingRoutes(): Promise<{ synced: number; skipped: number; failed: number }> {
    const result = { synced: 0, skipped: 0, failed: 0 };
    const activities = await this.repositories.activities.list();
    const needing = activities.filter((a) => a.routeSyncStatus === 'not_attempted' || a.routeSyncStatus === 'route_failed');
    if (needing.length === 0) return result;
    const CONCURRENCY = 3;
    for (let i = 0; i < needing.length; i += CONCURRENCY) {
      const batch = needing.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (a) => {
        const fetchResult = await this.stravaSessionService.fetchActivityRoute(Number(a.providerActivityId));
        if (fetchResult.success) {
          const normalized = this.routeNormalizer.normalize(a.id, a.providerActivityId, fetchResult);
          if (normalized.success) {
            await this.repositories.activityRoutes.upsert(normalized.route);
            await this.repositories.activities.updateRouteSyncStatus(a.id, true, 'route_synced');
            result.synced++;
          } else {
            const status = normalized.errorCode === 'NO_GPS_ROUTE' ? 'no_route' as const : 'route_failed' as const;
            await this.repositories.activities.updateRouteSyncStatus(a.id, false, status);
            result.skipped++;
          }
        } else {
          const status = fetchResult.errorCode === 'NO_GPS_ROUTE' ? 'no_route' as const : 'route_failed' as const;
          await this.repositories.activities.updateRouteSyncStatus(a.id, false, status);
          result.skipped++;
        }
      }));
    }
    return result;
  }

  protected toggleSyncMenu(): void {
    this.syncMenuOpen.update((v) => !v);
  }

  protected closeSyncMenu(): void {
    this.syncMenuOpen.set(false);
  }

  protected toggleAppMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.appMenuOpen.update((v) => !v);
  }

  protected openReleaseNotes(): void {
    this.appMenuOpen.set(false);
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: environment.releaseNotesUrl });
    }
  }

  protected reportBug(): void {
    this.appMenuOpen.set(false);
    this.dialog.open(BugReportDialog, {
      panelClass: 'trailroam-confirm-dialog',
    });
  }

  protected openDocs(): void {
    this.appMenuOpen.set(false);
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: environment.docsUrl });
    }
  }

  protected openDonate(): void {
    this.appMenuOpen.set(false);
    this.dialog.open(DonateDialog, {
      panelClass: 'trailroam-confirm-dialog',
    });
  }

  protected openAbout(): void {
    this.appMenuOpen.set(false);
    this.dialog.open(AboutDialog, {
      data: { version: this.extVersion },
      panelClass: 'trailroam-confirm-dialog',
    });
  }

  protected async dismissSyncSummary(): Promise<void> {
    this.syncSummary.set(null);
    const now = new Date().toISOString();
    const settings = await this.repositories.settings.getOrCreateDefault();
    settings.dismissedSyncAt = now;
    settings.updatedAt = now;
    await this.repositories.settings.put(settings);
  }

  private async showSyncResult(result: SyncNewResult): Promise<void> {
    await this.syncSummaryService.updateFromResult(result);
    const summary = await this.syncSummaryService.getSummary();
    this.syncSummary.set(summary);
  }

  protected syncNewActivities(): void {
    this.closeSyncMenu();
    this.resetCounters();
    this.startSyncProgress('Syncing...');
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected syncMissingRoutes(): void {
    this.closeSyncMenu();
    this.syncSummary.set(null);
    this.resetCounters();
    this.startSyncProgress('Syncing missing routes...');
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSyncMissing=true' });
    }
  }

  protected async clearAndResync(): Promise<void> {
    this.closeSyncMenu();
    const confirmed = await this.confirmService.confirm({
      title: 'Clear and re-sync',
      message: 'This will delete locally synced activities and route data, then import them again from Strava. Your settings will be kept.',
      confirmLabel: 'Clear and re-sync',
      danger: true,
    });
    if (!confirmed) { return; }
    this.startSyncProgress('Clearing synced data...');
    await Promise.all([
      this.repositories.activities.clear(),
      this.repositories.activityRoutes.clear(),
      this.repositories.syncState.clear(),
    ]);
    this.resetCounters();
    this.pendingHistoryTrigger = 'clear_and_resync';
    this.dataRefresh.syncProgressLabel.set('Syncing...');
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected async clearSyncedLocalData(): Promise<void> {
    this.closeSyncMenu();
    const confirmed = await this.confirmService.confirm({
      title: 'Clear synced local data',
      message: 'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
      confirmLabel: 'Clear data',
      danger: true,
    });
    if (!confirmed) { return; }
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
    this.toastService.show(`Backup: ${backup.settings.length} settings, ${backup.accessState.length} access state, ${backup.syncState.length} sync state, ${backup.activities.length} activities, ${backup.activityRoutes.length} routes.`);
    await this.syncHistoryService.record('backup_local_data', {
      importedCount: 0, updatedCount: 0, routesSyncedCount: 0, skippedCount: 0, failedCount: 0, rateLimitedCount: 0, status: 'completed',
    });
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
      if (!summary.hasResults) {
        this.syncSummary.set(null);
        return;
      }
      const settings = await this.repositories.settings.get();
      if (settings?.dismissedSyncAt && summary.lastSuccessfulSyncAt && settings.dismissedSyncAt >= summary.lastSuccessfulSyncAt) {
        this.syncSummary.set(null);
        return;
      }
      this.syncSummary.set(summary);
    } catch {
    }
  }
}

@Component({
  selector: 'app-about-dialog',
  standalone: true,
  imports: [MatDialogModule],
  styles: [`
    :host { display: block; position: relative; padding: 25px; }
    .about-grid { display: flex; gap: 24px; min-width: 420px; max-width: 540px; }
    .about-left { flex: 1; display: flex; flex-direction: column; }
    .about-right { width: 220px; flex-shrink: 0; }
    .about-header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .about-logo { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #15803d, #1fc4b4); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: -20px; }
    .about-logo svg { width: 22px; height: 22px; color: #fff; }
    .about-name { font-size: 1.125rem; font-weight: 700; color: #111827; margin: 0; }
    .about-version { font-size: 0.75rem; color: #9ca3af; margin: 0 0 16px; }
    .about-description { margin-bottom: 12px; }
    .about-description p { font-size: 0.8125rem; color: #6b7280; margin: 0; line-height: 1.5; }
    .about-contributors { margin-bottom: 16px; }
    .about-contributors p { font-size: 0.8125rem; color: #6b7280; margin: 0; line-height: 1.5; }
    .about-contributors span { font-weight: 600; color: #374151; }
    .about-section-title { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; margin: 0 0 8px; }
    .privacy-callout { background: #eef8f0; border-radius: 8px; padding: 12px; display: flex; gap: 10px; margin-bottom: 14px; }
    .privacy-callout svg { width: 16px; height: 16px; color: #15803d; flex-shrink: 0; margin-top: 1px; }
    .privacy-callout p { font-size: 0.75rem; color: #374151; line-height: 1.5; margin: 0; }
    .licenses-list { margin: 0; padding: 0; list-style: none; }
    .licenses-list li { font-size: 0.75rem; color: #6b7280; line-height: 1.8; padding: 0; }
    .about-actions { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
    .btn-update { background: #15803d; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font: inherit; font-size: 0.8125rem; font-weight: 600; height: 36px; padding: 0 16px; }
    .btn-update:hover { background: #166534; }
    .btn-repo { background: transparent; border: 1px solid #dce6df; border-radius: 8px; color: #374151; cursor: pointer; font: inherit; font-size: 0.8125rem; font-weight: 500; height: 36px; padding: 0 16px; }
    .btn-repo:hover { background: #f9fafb; }
    .btn-close-x { background: transparent; border: 0; color: #9ca3af; cursor: pointer; font-size: 1.25rem; line-height: 1; padding: 0; position: absolute; right: 10px; top: 10px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
    .btn-close-x:hover { color: #374151; background: #f3f4f6; }
  `],
  template: `
    <button class="btn-close-x" type="button" mat-dialog-close aria-label="Close">&times;</button>
    <div class="about-grid">
      <div class="about-left">
        <div class="about-header">
          <div class="about-logo">
            <svg viewBox="0 0 128 128" width="40" height="40"><circle cx="64" cy="64" r="53" fill="none" stroke="#fff" stroke-width="9"/><path d="M24 91 L53 47 L73 76 L84 61 L107 94" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div>
            <h2 class="about-name">{{ appName }}</h2>
            <p class="about-version">v{{ data.version }}</p>
          </div>
        </div>

        <div class="about-description">
          <p>{{ appDescription }}</p>
        </div>
        <div class="about-contributors">
          <p>Created by <span>Mikolaj K.</span></p>
        </div>

        <div class="about-actions">
          <button class="btn-update" type="button" (click)="openUpdates()">Check for Updates</button>
          <button class="btn-repo" type="button" (click)="openRepo()">GitHub Repository</button>
        </div>
      </div>

      <div class="about-right">
        <p class="about-section-title">Privacy</p>
        <div class="privacy-callout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <p>All data is stored locally in your browser. Nothing is sent to external servers except map tile requests to OpenFreeMap.</p>
        </div>

        <p class="about-section-title">Third-Party Licenses</p>
        <ul class="licenses-list">
          <li>MapLibre GL JS</li>
          <li>OpenFreeMap</li>
          <li>Angular</li>
          <li>Angular Material</li>
          <li>Dexie.js</li>
        </ul>
      </div>
    </div>
  `,
})
export class AboutDialog {
  protected readonly appName = environment.appName;
  protected readonly appDescription = environment.appDescription;
  protected licensesOpen = false;

  constructor(@Inject(MAT_DIALOG_DATA) protected readonly data: { version: string }) {}

  protected openRepo(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: environment.repoUrl });
    }
  }

  protected openUpdates(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: environment.releaseNotesUrl });
    }
  }
}

@Component({
  selector: 'app-bug-report-dialog',
  standalone: true,
  imports: [MatDialogModule],
  styles: [`
    :host { display: block; max-width: 480px; padding: 25px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; position: relative; }
    h2 { font-size: 1.25rem; font-weight: 700; color: #111827; margin: 0 0 12px; }
    .warning-icon { font-size: 1.5rem; margin-right: 6px; }
    .checklist { margin: 0 0 20px; padding: 0; list-style: none; }
    .checklist li { font-size: 0.875rem; color: #374151; line-height: 1.6; padding: 4px 0; padding-left: 20px; position: relative; }
    .checklist li::before { content: '\\2022'; color: #9ca3af; position: absolute; left: 4px; }
    .note { font-size: 0.875rem; color: #6b7280; line-height: 1.6; margin: 0 0 20px; }
    .actions { display: flex; justify-content: center; gap: 8px; }
    .btn-report { background: #dc2626; border: 0; border-radius: 6px; color: #fff; cursor: pointer; font: inherit; font-size: 0.875rem; font-weight: 600; height: 36px; padding: 0 16px; }
    .btn-report:hover { background: #b91c1c; }
    .btn-close-x { background: transparent; border: 0; color: #9ca3af; cursor: pointer; font-size: 1.25rem; line-height: 1; padding: 0; position: absolute; right: 10px; top: 10px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
    .btn-close-x:hover { color: #374151; background: #f3f4f6; }
  `],
  template: `
    <button class="btn-close-x" type="button" mat-dialog-close aria-label="Close">&times;</button>

    <h2><span class="warning-icon">&#9888;&#65039;</span> Before opening an issue, please check the following:</h2>

    <ul class="checklist">
      <li>Review the documentation and any available help resources.</li>
      <li>Search existing GitHub issues to see if your problem or request has already been reported.</li>
    </ul>

    <p class="note">Please avoid submitting duplicate or unrelated issues. As a solo developer, I may not always be able to respond to every report, so it really helps if issues are well-documented.</p>

    <p class="note">Make sure your issue is clear, specific, and well written. Thank you for your understanding and support.</p>

    <h2>&#128029; Bug Report Template</h2>
    <p class="note">To help fix issues quickly, please include:</p>
    <ul class="checklist">
      <li><strong>As is:</strong> What is currently happening?</li>
      <li><strong>Expected:</strong> What should happen instead?</li>
      <li><strong>Steps to reproduce:</strong><br>Go to &hellip;<br>Click on &hellip;<br>Observe &hellip;</li>
    </ul>
    <p class="note">If possible, also add screenshots, logs, or any extra context that might help reproduce the issue.</p>

    <div class="actions">
      <button class="btn-report" type="button" (click)="openGitHub()" mat-dialog-close>Continue to GitHub</button>
    </div>
  `,
})
export class BugReportDialog {
  protected readonly extVersion: string = (globalThis as any).chrome?.runtime?.getManifest?.()?.version ?? 'dev';
  protected readonly buildDate: string = document.documentElement.getAttribute('data-build') ?? 'dev';

  protected openGitHub(): void {
    const body = `**Browser:** ${navigator.userAgent}\n**Extension:** ${this.extVersion}\n**Build:** ${this.buildDate}\n\n**Describe the bug:**`;
    const url = `${environment.reportBugUrl}?body=${encodeURIComponent(body)}`;
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url });
    }
  }
}

@Component({
  selector: 'app-donate-dialog',
  standalone: true,
  imports: [MatDialogModule],
  styles: [`
    :host { display: block; max-width: 400px; padding: 25px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-align: center; position: relative; }
    .heart { font-size: 2.5rem; display: block; margin-bottom: 8px; }
    h2 { font-size: 1.25rem; font-weight: 700; color: #111827; margin: 0 0 12px; }
    p { font-size: 0.875rem; color: #6b7280; line-height: 1.6; margin: 0 0 14px; }
    .actions { display: flex; justify-content: center; gap: 8px; }
    .btn-donate { background: #15803d; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font: inherit; font-size: 0.875rem; font-weight: 600; height: 38px; padding: 0 24px; }
    .btn-donate:hover { background: #166534; }
    .btn-close-x { background: transparent; border: 0; color: #9ca3af; cursor: pointer; font-size: 1.25rem; line-height: 1; padding: 0; position: absolute; right: 10px; top: 10px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
    .btn-close-x:hover { color: #374151; background: #f3f4f6; }
  `],
  template: `
    <button class="btn-close-x" type="button" mat-dialog-close aria-label="Close">&times;</button>
    <span class="heart">&#10084;&#65039;</span>
    <h2>Support This Project</h2>

    <p>This project is built and maintained by a solo developer in free time.</p>

    <p>If you find it useful, you can support its development with a donation. It helps me dedicate more time to improving the project and bringing new ideas to life.</p>

    <p>Every contribution is greatly appreciated and directly supports future development &#10084;&#65039;</p>

    <div class="actions">
      <button class="btn-donate" type="button" (click)="openDonateUrl()" mat-dialog-close>Donate</button>
    </div>
  `,
})
export class DonateDialog {
  protected openDonateUrl(): void {
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://ko-fi.com/mkostyrko' });
    }
  }
}

import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastComponent],
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

  private pendingRouteCount = 0;
  private totalRouteCount = 0;
  private runningStoreCount = { activities: 0, routes: 0, noRoutes: 0 };
  private importHistoryRecorded = false;

  protected readonly syncSummary = signal<SyncSummary | null>(null);
  protected readonly syncMenuOpen = signal(false);
  protected readonly lastSyncLabel = signal<string | null>(null);
  protected readonly buildDate: string =
    document.documentElement.getAttribute('data-build') ?? 'dev';

  constructor() {
    this.loadSyncSummary();
    this.loadLastSyncLabel();
    this.listenForMessages();
    globalThis.addEventListener('click', () => this.closeSyncMenu());
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
        this.toastService.show('Synced just now', 15000);
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
        console.log('[Trailroam] Store activities received, count:', msg.payload?.activities?.length ?? 0);
        this.storeImportedData(msg.payload).then(() => {
          console.log('[Trailroam] Store activities completed');
          this.loadSyncSummary();
          this.loadLastSyncLabel();
          this.dataRefresh.emitRefresh();
          this.toastService.show('Synced just now', 15000);
          return undefined;
        });
      }
      return undefined;
    });
  }

  private async storeImportedData(payload: any): Promise<void> {
    const now = new Date().toISOString();
    const rawActivities: StravaActivityResponse[] = payload?.activities ?? [];
    const rawRoutes: Array<{ activityId: number; routeData: any }> = payload?.routes ?? [];

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

    const allRoutesDone = this.totalRouteCount > 0 && this.pendingRouteCount >= this.totalRouteCount;

    if (allRoutesDone || rawActivities.length > 0) {
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
      if (!this.importHistoryRecorded && (allRoutesDone || (rawActivities.length > 0 && this.totalRouteCount === 0))) {
        this.importHistoryRecorded = true;
        await this.syncHistoryService.record('sync_new_activities', {
          importedCount: this.runningStoreCount.activities,
          updatedCount: 0,
          routesSyncedCount: this.runningStoreCount.routes + attempts.synced,
          skippedCount: this.runningStoreCount.noRoutes + attempts.skipped,
          failedCount: attempts.failed,
          rateLimitedCount: 0,
          status: 'completed',
        });
      }
    }
  }

  private async sendSyncedIds(sendResponse: (response: any) => void): Promise<void> {
    const activities = await this.repositories.activities.list();
    const ids = new Set(activities.map((a) => a.providerActivityId));
    sendResponse({ syncedIds: [...ids] });
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
    this.importHistoryRecorded = false;
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: 'https://www.strava.com/dashboard?trailroamSync=true' });
    }
  }

  protected syncMissingRoutes(): void {
    this.closeSyncMenu();
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
    this.syncNewActivities();
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

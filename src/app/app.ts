import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SyncSummaryService, type SyncSummary } from './storage/sync-summary.service';
import { LocalDataService } from './storage/local-data.service';
import { TRAILROAM_REPOSITORIES } from './storage/repositories/repositories.token';
import { StravaActivityNormalizer } from './strava/strava-activity-normalizer';
import type { StravaActivityResponse } from './strava/strava-session.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly syncSummaryService = inject(SyncSummaryService);
  private readonly localDataService = inject(LocalDataService);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly activityNormalizer = inject(StravaActivityNormalizer);

  private pendingRouteCount = 0;
  private totalRouteCount = 0;
  private runningStoreCount = { activities: 0, routes: 0, noRoutes: 0 };

  protected readonly syncSummary = signal<SyncSummary | null>(null);
  protected readonly syncMenuOpen = signal(false);
  protected readonly buildDate: string =
    document.documentElement.getAttribute('data-build') ?? 'dev';

  constructor() {
    this.loadSyncSummary();
    this.listenForMessages();
  }

  private listenForMessages(): void {
    const c = (globalThis as any).chrome;
    if (!c?.runtime?.onMessage) { return; }
    console.log('[Trailroam] Registering runtime message listener');
    c.runtime.onMessage.addListener((msg: any) => {
      console.log('[Trailroam] Runtime message received', msg?.type, msg?.payload ? '(has payload)' : '(no payload)');
      if (msg?.type === 'TRAILROAM_SYNC_DONE') {
        console.log('[Trailroam] Sync done notification received');
        this.loadSyncSummary();
      }
      if (msg?.type === 'TRAILROAM_STORE_ACTIVITIES') {
        console.log('[Trailroam] Store activities received, count:', msg.payload?.activities?.length ?? 0);
        this.storeImportedData(msg.payload).then(() => {
          console.log('[Trailroam] Store activities completed');
          this.loadSyncSummary();
        });
      }
    });
  }

  private async storeImportedData(payload: any): Promise<void> {
    const now = new Date().toISOString();
    const rawActivities: StravaActivityResponse[] = payload?.activities ?? [];
    const rawRoutes: Array<{ activityId: number; routeData: any }> = payload?.routes ?? [];

    if (rawRoutes.length > 0) {
      this.totalRouteCount += rawRoutes.length;
    }

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
          const route = {
            activityId: 'strava:' + activityId,
            providerActivityId: activityId,
            coordinates: validCoords,
            pointCount: validCoords.length,
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
      await this.repositories.syncState.put({
        id: 'default',
        status: 'completed',
        completedAt: now,
        lastSuccessfulSyncAt: now,
        startedAt: now,
        importedCount: this.runningStoreCount.activities,
        updatedCount: 0,
        routesSyncedCount: this.runningStoreCount.routes,
        skippedCount: this.runningStoreCount.noRoutes,
        failedCount: 0,
      });
    }
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

import { Injectable, inject } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { StravaActivityNormalizer } from '../strava/strava-activity-normalizer';
import { StravaSessionService } from '../strava/strava-session.service';
import { StravaRouteNormalizer } from '../strava/strava-route-normalizer';
import { SyncHistoryService } from '../storage/sync-history.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { simplifyCoordinates } from '../strava/route-coordinate-utils';
import type { StravaActivityResponse } from '../strava/strava-session.service';
import { logger } from '../shared/logger';

export interface BridgeCallbacks {
  onSyncDone: () => void;
  onSyncSummaryNeedsUpdate: () => void;
  onLastSyncLabelNeedsUpdate: () => void;
}

@Injectable({
  providedIn: 'root',
})
export class ExtensionBridgeService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly activityNormalizer = inject(StravaActivityNormalizer);
  private readonly stravaSessionService = inject(StravaSessionService);
  private readonly routeNormalizer = inject(StravaRouteNormalizer);
  private readonly syncHistoryService = inject(SyncHistoryService);
  private readonly dataRefresh = inject(DataRefreshService);

  private pendingRouteCount = 0;
  private totalRouteCount = 0;
  private runningStoreCount = { activities: 0, routes: 0, noRoutes: 0 };
  private importHistoryRecorded = false;
  private pendingHistoryTrigger: 'sync_new_activities' | 'clear_and_resync' = 'sync_new_activities';
  private storeQueue = Promise.resolve();
  private callbacks: BridgeCallbacks | null = null;

  init(callbacks: BridgeCallbacks): void {
    this.callbacks = callbacks;
    const c = (globalThis as any).chrome;
    if (!c?.runtime?.onMessage) { return; }
    logger.info('Registering runtime message listener');
    c.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any) => {
      logger.info('Runtime message received', msg?.type, msg?.payload ? '(has payload)' : '(no payload)');
      if (msg?.type === 'TRAILROAM_SYNC_DONE') {
        logger.info('Sync done notification received');
        this.callbacks?.onSyncDone();
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
        logger.info('Store activities received, activities:', msg.payload?.activities?.length ?? 0, 'routes:', msg.payload?.routes?.length ?? 0);
        this.dataRefresh.syncProgressLabel.set('Storing data...');
        this.storeQueue = this.storeQueue.then(() => this.storeImportedData(msg.payload));
      }
      return undefined;
    });
  }

  resetCounters(): void {
    this.pendingRouteCount = 0;
    this.totalRouteCount = 0;
    this.runningStoreCount = { activities: 0, routes: 0, noRoutes: 0 };
    this.importHistoryRecorded = false;
  }

  setPendingHistoryTrigger(trigger: 'sync_new_activities' | 'clear_and_resync'): void {
    this.pendingHistoryTrigger = trigger;
  }

  private async storeImportedData(payload: any): Promise<void> {
    const now = new Date().toISOString();
    const rawActivities: StravaActivityResponse[] = payload?.activities ?? [];
    const rawRoutes: Array<{ activityId: number; routeData: any }> = payload?.routes ?? [];
    const hasFinalBatch = payload?.isFinalBatch === true;

    if (rawActivities.length === 0 && rawRoutes.length === 0) {
      this.callbacks?.onSyncDone();
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
          const simplified = simplifyCoordinates(validCoords);
          const route = {
            activityId: 'strava:' + activityId,
            providerActivityId: activityId,
            simplifiedCoordinates: simplified,
            simplifiedPointCount: simplified.length,
            pointCount: validCoords.length,
            syncedAt: now,
            updatedAt: now,
          };
          await this.repositories.activityRoutes.put(route);
          const geometry = {
            activityId: 'strava:' + activityId,
            providerActivityId: activityId,
            coordinates: validCoords,
            elevations,
            cumulativeDistances,
            syncedAt: now,
            updatedAt: now,
          };
          await this.repositories.routeGeometry.put(geometry);

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
      this.callbacks?.onSyncSummaryNeedsUpdate();
      this.callbacks?.onLastSyncLabelNeedsUpdate();
      this.dataRefresh.emitRefresh();
      this.callbacks?.onSyncDone();
    }

    if (!allRoutesDone && rawRoutes.length > 0) {
      this.dataRefresh.syncProgressLabel.set('Storing routes...');
    }
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
}

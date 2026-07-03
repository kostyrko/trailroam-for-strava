import { signal } from '@angular/core';
import type { SyncStatus } from '../../storage/storage.models';

export interface SyncProgress {
  status: SyncStatus;
  phase: 'idle' | 'checking_session' | 'fetching_activities' | 'fetching_routes' | 'completed' | 'failed' | 'cancelled';
  fetchedActivities: number;
  totalActivities: number;
  syncedRoutes: number;
  totalRoutes: number;
  errorMessage?: string;
}

export function createSyncProgressSignal() {
  return signal<SyncProgress>({
    status: 'idle',
    phase: 'idle',
    fetchedActivities: 0,
    totalActivities: 0,
    syncedRoutes: 0,
    totalRoutes: 0,
  });
}

export function setProgress(progress: ReturnType<typeof signal<SyncProgress>>, phase: SyncProgress['phase']): void {
  progress.set({
    status: phase === 'completed' ? 'completed' : phase === 'failed' ? 'failed' : phase === 'cancelled' ? 'cancelled' : 'fetching_activities',
    phase,
    fetchedActivities: 0,
    totalActivities: 0,
    syncedRoutes: 0,
    totalRoutes: 0,
  });
}

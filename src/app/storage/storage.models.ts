export const DATABASE_SCHEMA_VERSION = 1;
export const DEFAULT_RECORD_ID = 'default';

export type ActivityCategory =
  | 'ride'
  | 'run'
  | 'walk'
  | 'hike'
  | 'water'
  | 'winter'
  | 'other';

export type RouteSyncStatus =
  | 'not_attempted'
  | 'fetching'
  | 'route_synced'
  | 'no_route'
  | 'empty_route'
  | 'route_failed'
  | 'invalid_coordinates'
  | 'skipped';

export interface ActivityRecord {
  id: string;
  provider: 'strava';
  providerActivityId: string;
  name: string;
  sportType: string;
  activityCategory: ActivityCategory;
  startDate: string;
  startDateLocal?: string;
  distanceMeters?: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  hasRoute: boolean;
  routeSyncStatus: RouteSyncStatus;
  sourceUrl?: string;
  importedAt: string;
  updatedAt: string;
}

export interface RouteBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ActivityRouteRecord {
  activityId: string;
  providerActivityId: string;
  coordinates: [number, number][];
  pointCount: number;
  bounds?: RouteBounds;
  simplifiedCoordinates?: [number, number][];
  simplifiedPointCount?: number;
  hasSimplifiedGeometry?: boolean;
  syncedAt: string;
  updatedAt: string;
}

export type SyncStatus =
  | 'idle'
  | 'checking_session'
  | 'fetching_activities'
  | 'fetching_routes'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SyncStateRecord {
  id: typeof DEFAULT_RECORD_ID;
  status: SyncStatus;
  startedAt?: string;
  completedAt?: string;
  lastSuccessfulSyncAt?: string;
  lastActivityFetchAt?: string;
  totalActivitiesSeen?: number;
  importedCount?: number;
  updatedCount?: number;
  routesSyncedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  currentActivityId?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface SettingsRecord {
  id: typeof DEFAULT_RECORD_ID;
  mapProvider: 'openfreemap';
  preferredDefaultRoute?: 'map' | 'activities';
  createdAt: string;
  updatedAt: string;
}

export interface AccessStateRecord {
  id: typeof DEFAULT_RECORD_ID;
  status: 'beta_unrestricted' | 'free_limited' | 'unlocked' | 'expired';
  maxVisibleActivities: number | null;
  accessCodeHash?: string;
  unlockedUntil?: string;
  updatedAt: string;
}

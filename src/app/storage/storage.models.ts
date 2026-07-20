export const DATABASE_SCHEMA_VERSION = 5;
export const DEFAULT_RECORD_ID = 'default';

export type ActivityCategory =
  | 'ride'
  | 'run'
  | 'walk'
  | 'hike'
  | 'water'
  | 'paddling'
  | 'winter'
  | 'winter_sport'
  | 'mountaineering'
  | 'other';

export type RouteSyncStatus =
  | 'not_attempted'
  | 'fetching'
  | 'route_synced'
  | 'no_route'
  | 'empty_route'
  | 'route_failed'
  | 'invalid_coordinates'
  | 'skipped'
  | 'rate_limited';

export type ActivityProvider = 'strava' | 'local';
export type ActivityStatus = 'completed' | 'planned';

export interface ActivityRecord {
  id: string;
  provider: ActivityProvider;
  providerActivityId: string;
  name: string;
  sportType: string;
  activityCategory: ActivityCategory;
  startDate: string;
  startDateLocal?: string;
  distanceMeters?: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  totalElevationGainMeters?: number;
  averageSpeedMetersPerSecond?: number;
  activityStatus?: ActivityStatus;
  averageHeartrateBpm?: number;
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
  simplifiedCoordinates: [number, number][];
  simplifiedPointCount: number;
  pointCount: number;
  bounds?: RouteBounds;
  syncedAt: string;
  updatedAt: string;
}

export interface RouteGeometryRecord {
  activityId: string;
  providerActivityId: string;
  coordinates: [number, number][];
  elevations?: number[];
  cumulativeDistances?: number[];
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
  rateLimitedCount?: number;
  currentActivityId?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface SettingsRecord {
  id: typeof DEFAULT_RECORD_ID;
  mapProvider: 'openfreemap';
  preferredDefaultRoute?: 'map' | 'activities';
  dismissedSyncAt?: string;
  dismissedLocalDataNoticeAt?: string;
  autoFilterHintCount?: number;
  mapExplorerPanelExpanded?: boolean;
  lastSeenVersion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncHistoryRecord {
  id: string;
  trigger:
    | 'sync_new_activities'
    | 'sync_missing_routes'
    | 'clear_and_resync'
    | 'clear_synced_local_data'
    | 'backup_local_data'
    | 'restore_local_data';
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'failed' | 'cancelled';
  importedCount: number;
  updatedCount: number;
  routesSyncedCount: number;
  skippedCount: number;
  failedCount: number;
  rateLimitedCount: number;
  totalActivitiesAfter: number;
  activitiesWithRoutesAfter: number;
  activitiesWithoutRoutesAfter: number;
  errorMessage?: string;
}

export interface AccessStateRecord {
  id: typeof DEFAULT_RECORD_ID;
  status: 'beta_unrestricted' | 'free_limited' | 'unlocked' | 'expired';
  maxVisibleActivities: number | null;
  accessCodeHash?: string;
  unlockedUntil?: string;
  updatedAt: string;
}

/**
 * A place the user saved from the Map Explorer (search result or map click). Stored locally
 * only; never uploaded. Coordinates are `[latitude, longitude]` in decimal degrees.
 */
export interface SavedPlaceRecord {
  id: string;
  /** Confirmed or custom user-facing name. */
  name: string;
  /** Optional free-text notes the user attached to the place. */
  notes?: string;
  /** Original search-provider result name, when the place came from a search. */
  providerName?: string;
  latitude: number;
  longitude: number;
  /** Secondary location text (city/region/country) shown under the name. */
  secondaryLabel?: string;
  /** Stable provider id (e.g. Photon `osm_type`+`osm_id`); used for duplicate detection. */
  providerId?: string;
  /** How the place was created: 'search' (search panel) or 'map-context-menu' (right-click). */
  source?: 'search' | 'map-context-menu';
  /** ISO 8601 UTC timestamp. */
  createdAt: string;
  /** ISO 8601 UTC timestamp. */
  updatedAt: string;
}

import type { ActivityRecord, ActivityRouteRecord } from '../storage/storage.models';

export interface MapRouteFeature {
  activityId: string;
  activity: ActivityRecord;
  route: ActivityRouteRecord;
  coordinates: [number, number][];
  name: string;
  fullGeometryId?: string;
}

import { TrailroamDatabase } from '../db';
import { ActivityRouteRecord } from '../storage.models';

export interface UpsertRouteResult {
  inserted: boolean;
  route: ActivityRouteRecord;
}

export class ActivityRoutesRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(route: ActivityRouteRecord): Promise<string> {
    return this.db.activity_routes.put(route);
  }

  async get(activityId: string): Promise<ActivityRouteRecord | undefined> {
    return this.db.activity_routes.get(activityId);
  }

  async upsert(route: ActivityRouteRecord): Promise<UpsertRouteResult> {
    const existing = await this.get(route.activityId);
    const inserted = existing === undefined;

    const merged: ActivityRouteRecord = existing
      ? {
          ...route,
          syncedAt: existing.syncedAt,
          updatedAt: new Date().toISOString(),
        }
      : route;

    await this.put(merged);
    return { inserted, route: merged };
  }

  async list(): Promise<ActivityRouteRecord[]> {
    return this.db.activity_routes.toArray();
  }

  async clear(): Promise<void> {
    await this.db.activity_routes.clear();
  }
}

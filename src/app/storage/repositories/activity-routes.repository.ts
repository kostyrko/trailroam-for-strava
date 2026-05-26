import { TrailroamDatabase } from '../db';
import { ActivityRouteRecord } from '../storage.models';

export class ActivityRoutesRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(route: ActivityRouteRecord): Promise<string> {
    return this.db.activity_routes.put(route);
  }

  async get(activityId: string): Promise<ActivityRouteRecord | undefined> {
    return this.db.activity_routes.get(activityId);
  }

  async list(): Promise<ActivityRouteRecord[]> {
    return this.db.activity_routes.toArray();
  }

  async clear(): Promise<void> {
    await this.db.activity_routes.clear();
  }
}

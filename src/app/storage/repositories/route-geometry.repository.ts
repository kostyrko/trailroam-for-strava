import { TrailroamDatabase } from '../db';
import { RouteGeometryRecord } from '../storage.models';

export class RouteGeometryRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(record: RouteGeometryRecord): Promise<string> {
    return this.db.route_geometry.put(record);
  }

  async get(activityId: string): Promise<RouteGeometryRecord | undefined> {
    return this.db.route_geometry.get(activityId);
  }

  async delete(activityId: string): Promise<void> {
    await this.db.route_geometry.delete(activityId);
  }

  async list(): Promise<RouteGeometryRecord[]> {
    return this.db.route_geometry.toArray();
  }

  async count(): Promise<number> {
    return this.db.route_geometry.count();
  }

  async clear(): Promise<void> {
    await this.db.route_geometry.clear();
  }
}

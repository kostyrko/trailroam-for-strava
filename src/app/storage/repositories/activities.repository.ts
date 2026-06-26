import { TrailroamDatabase } from '../db';
import { ActivityRecord, type RouteSyncStatus } from '../storage.models';

export interface UpsertActivityResult {
  inserted: boolean;
  activity: ActivityRecord;
}

export class ActivitiesRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(activity: ActivityRecord): Promise<string> {
    return this.db.activities.put(activity);
  }

  async get(id: string): Promise<ActivityRecord | undefined> {
    return this.db.activities.get(id);
  }

  async upsert(activity: ActivityRecord): Promise<UpsertActivityResult> {
    const existing = await this.get(activity.id);
    const inserted = existing === undefined;

    const merged: ActivityRecord = existing
      ? {
          ...activity,
          hasRoute: existing.hasRoute,
          routeSyncStatus: existing.routeSyncStatus,
          importedAt: existing.importedAt,
          updatedAt: new Date().toISOString(),
        }
      : activity;

    await this.put(merged);
    return { inserted, activity: merged };
  }

  async updateRouteSyncStatus(id: string, hasRoute: boolean, routeSyncStatus: RouteSyncStatus): Promise<void> {
    await this.db.activities.update(id, { hasRoute, routeSyncStatus, updatedAt: new Date().toISOString() });
  }

  async updateName(id: string, name: string): Promise<void> {
    await this.db.activities.update(id, { name, updatedAt: new Date().toISOString() });
  }

  async delete(id: string): Promise<void> {
    await this.db.activities.delete(id);
  }

  async list(): Promise<ActivityRecord[]> {
    return this.db.activities.orderBy('startDate').reverse().toArray();
  }

  async listPage(page: number, pageSize: number): Promise<ActivityRecord[]> {
    return this.db.activities
      .orderBy('startDate')
      .reverse()
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
  }

  async count(): Promise<number> {
    return this.db.activities.count();
  }

  async countWithRouteSyncStatus(status: RouteSyncStatus): Promise<number> {
    return this.db.activities.where('routeSyncStatus').equals(status).count();
  }

  async clear(): Promise<void> {
    await this.db.activities.clear();
  }
}

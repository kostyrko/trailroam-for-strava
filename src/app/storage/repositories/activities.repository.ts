import { TrailroamDatabase } from '../db';
import { ActivityRecord } from '../storage.models';

export class ActivitiesRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(activity: ActivityRecord): Promise<string> {
    return this.db.activities.put(activity);
  }

  async get(id: string): Promise<ActivityRecord | undefined> {
    return this.db.activities.get(id);
  }

  async list(): Promise<ActivityRecord[]> {
    return this.db.activities.orderBy('startDate').reverse().toArray();
  }

  async clear(): Promise<void> {
    await this.db.activities.clear();
  }
}

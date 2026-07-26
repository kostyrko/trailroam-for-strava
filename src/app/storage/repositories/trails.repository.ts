import { TrailroamDatabase } from '../db';
import type { TrailRecord } from '../storage.models';

export class TrailsRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(trail: TrailRecord): Promise<string> {
    return this.db.trails.put(trail);
  }

  async get(id: string): Promise<TrailRecord | undefined> {
    return this.db.trails.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.trails.delete(id);
  }

  /** Newest first (ordered by `createdAt` descending). */
  async list(): Promise<TrailRecord[]> {
    return this.db.trails.orderBy('createdAt').reverse().toArray();
  }

  async count(): Promise<number> {
    return this.db.trails.count();
  }

  async clear(): Promise<void> {
    await this.db.trails.clear();
  }

  /**
   * Updates only the name of a trail and refreshes `updatedAt`.
   */
  async updateName(id: string, name: string): Promise<TrailRecord | undefined> {
    const existing = await this.db.trails.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: TrailRecord = {
      ...existing,
      name,
      updatedAt: new Date().toISOString(),
    };
    await this.db.trails.put(updated);
    return updated;
  }

  /**
   * Replaces the activityIds array and refreshes `updatedAt`.
   */
  async updateActivityIds(id: string, activityIds: string[]): Promise<TrailRecord | undefined> {
    const existing = await this.db.trails.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: TrailRecord = {
      ...existing,
      activityIds,
      updatedAt: new Date().toISOString(),
    };
    await this.db.trails.put(updated);
    return updated;
  }

  /**
   * Finds a trail that contains the given activity ID. Returns the first match, or undefined.
   */
  async findByActivityId(activityId: string): Promise<TrailRecord | undefined> {
    const all = await this.db.trails.toArray();
    return all.find((t) => t.activityIds.includes(activityId));
  }
}

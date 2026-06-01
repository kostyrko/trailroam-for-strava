import { TrailroamDatabase } from '../db';
import { SyncHistoryRecord } from '../storage.models';

export class SyncHistoryRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(record: SyncHistoryRecord): Promise<string> {
    return this.db.sync_history.put(record);
  }

  async list(): Promise<SyncHistoryRecord[]> {
    return this.db.sync_history.orderBy('completedAt').reverse().toArray();
  }

  async clear(): Promise<void> {
    await this.db.sync_history.clear();
  }
}

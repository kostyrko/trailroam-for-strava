import { TrailroamDatabase } from '../db';
import { DEFAULT_RECORD_ID, SyncStateRecord } from '../storage.models';

export class SyncStateRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(syncState: SyncStateRecord): Promise<string> {
    return this.db.sync_state.put(syncState);
  }

  async get(): Promise<SyncStateRecord | undefined> {
    return this.db.sync_state.get(DEFAULT_RECORD_ID);
  }

  async list(): Promise<SyncStateRecord[]> {
    return this.db.sync_state.toArray();
  }

  async clear(): Promise<void> {
    await this.db.sync_state.clear();
  }
}

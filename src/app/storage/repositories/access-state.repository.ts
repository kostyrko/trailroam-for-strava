import { TrailroamDatabase } from '../db';
import { AccessStateRecord, DEFAULT_RECORD_ID } from '../storage.models';

export class AccessStateRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(accessState: AccessStateRecord): Promise<string> {
    return this.db.access_state.put(accessState);
  }

  async get(): Promise<AccessStateRecord | undefined> {
    return this.db.access_state.get(DEFAULT_RECORD_ID);
  }

  async list(): Promise<AccessStateRecord[]> {
    return this.db.access_state.toArray();
  }

  async clear(): Promise<void> {
    await this.db.access_state.clear();
  }
}

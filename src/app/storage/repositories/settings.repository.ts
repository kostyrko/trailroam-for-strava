import { TrailroamDatabase } from '../db';
import { DEFAULT_RECORD_ID, SettingsRecord } from '../storage.models';

export class SettingsRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(settings: SettingsRecord): Promise<string> {
    return this.db.settings.put(settings);
  }

  async get(): Promise<SettingsRecord | undefined> {
    return this.db.settings.get(DEFAULT_RECORD_ID);
  }
}

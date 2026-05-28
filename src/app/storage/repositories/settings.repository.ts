import { TrailroamDatabase } from '../db';
import { DEFAULT_RECORD_ID, type SettingsRecord } from '../storage.models';

export class SettingsRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(settings: SettingsRecord): Promise<string> {
    return this.db.settings.put(settings);
  }

  async get(): Promise<SettingsRecord | undefined> {
    return this.db.settings.get(DEFAULT_RECORD_ID);
  }

  async list(): Promise<SettingsRecord[]> {
    return this.db.settings.toArray();
  }

  async clear(): Promise<void> {
    await this.db.settings.clear();
  }

  async getOrCreateDefault(now = new Date()): Promise<SettingsRecord> {
    const existingSettings = await this.get();

    if (existingSettings) {
      return existingSettings;
    }

    const timestamp = now.toISOString();
    const defaultSettings: SettingsRecord = {
      id: DEFAULT_RECORD_ID,
      mapProvider: 'openfreemap',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.put(defaultSettings);

    return defaultSettings;
  }
}

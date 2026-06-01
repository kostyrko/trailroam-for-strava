import { TrailroamDatabase } from '../db';
import { AccessStateRepository } from './access-state.repository';
import { ActivitiesRepository } from './activities.repository';
import { ActivityRoutesRepository } from './activity-routes.repository';
import { SettingsRepository } from './settings.repository';
import { SyncHistoryRepository } from './sync-history.repository';
import { SyncStateRepository } from './sync-state.repository';

export interface TrailroamRepositories {
  activities: ActivitiesRepository;
  activityRoutes: ActivityRoutesRepository;
  syncState: SyncStateRepository;
  syncHistory: SyncHistoryRepository;
  settings: SettingsRepository;
  accessState: AccessStateRepository;
}

export function createRepositories(db: TrailroamDatabase): TrailroamRepositories {
  return {
    activities: new ActivitiesRepository(db),
    activityRoutes: new ActivityRoutesRepository(db),
    syncState: new SyncStateRepository(db),
    syncHistory: new SyncHistoryRepository(db),
    settings: new SettingsRepository(db),
    accessState: new AccessStateRepository(db),
  };
}

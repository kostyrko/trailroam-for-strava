import { TestBed } from '@angular/core/testing';
import { LocalDataService } from './local-data.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import { TrailroamRepositories } from './repositories';
import { DATABASE_SCHEMA_VERSION } from './storage.models';

describe('LocalDataService', () => {
  it('should clear synced local data while leaving settings and access state untouched', async () => {
    const settingsClear = vi.fn();
    const accessStateClear = vi.fn();
    const repositories = {
      activities: { clear: vi.fn().mockResolvedValue(undefined) },
      activityRoutes: { clear: vi.fn().mockResolvedValue(undefined) },
      syncState: { clear: vi.fn().mockResolvedValue(undefined) },
      settings: { clear: settingsClear },
      accessState: { clear: accessStateClear },
    } as unknown as TrailroamRepositories;

    TestBed.configureTestingModule({
      providers: [
        LocalDataService,
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: repositories,
        },
      ],
    });

    await TestBed.inject(LocalDataService).clearSyncedLocalData();

    expect(repositories.activities.clear).toHaveBeenCalledOnce();
    expect(repositories.activityRoutes.clear).toHaveBeenCalledOnce();
    expect(repositories.syncState.clear).toHaveBeenCalledOnce();
    expect(settingsClear).not.toHaveBeenCalled();
    expect(accessStateClear).not.toHaveBeenCalled();
  });

  it('should create a backup with all data tables', async () => {
    const repositories = {
      settings: { list: vi.fn().mockResolvedValue([{ id: 'default', mapProvider: 'openfreemap' }]) },
      accessState: { list: vi.fn().mockResolvedValue([{ id: 'default', status: 'beta_unrestricted' }]) },
      syncState: { list: vi.fn().mockResolvedValue([{ id: 'default', status: 'completed', importedCount: 5 }]) },
      activities: { list: vi.fn().mockResolvedValue([{ id: 'strava:1', name: 'Morning Ride' }]) },
      activityRoutes: { list: vi.fn().mockResolvedValue([{ activityId: 'strava:1', coordinates: [] }]) },
    } as unknown as TrailroamRepositories;

    TestBed.configureTestingModule({
      providers: [
        LocalDataService,
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: repositories,
        },
      ],
    });

    const backup = await TestBed.inject(LocalDataService).backup();

    expect(backup.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(backup.exportedAt).toBeTruthy();
    expect(backup.settings).toHaveLength(1);
    expect(backup.accessState).toHaveLength(1);
    expect(backup.syncState).toHaveLength(1);
    expect(backup.activities).toHaveLength(1);
    expect(backup.activityRoutes).toHaveLength(1);
  });
});

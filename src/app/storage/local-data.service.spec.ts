import { TestBed } from '@angular/core/testing';
import { LocalDataService } from './local-data.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import { TrailroamRepositories } from './repositories';

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
});

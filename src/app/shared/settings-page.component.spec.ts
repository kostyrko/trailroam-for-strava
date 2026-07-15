import { TestBed } from '@angular/core/testing';
import { SettingsPage } from './settings-page.component';
import { TRAILROAM_DATABASE, TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { ConfirmService } from './confirm.service';
import { ToastService } from './toast.service';
import { SyncHistoryService } from '../storage/sync-history.service';
import { DataRefreshService } from './data-refresh.service';
import { LocalDataService } from '../storage/local-data.service';

describe('SettingsPage', () => {
  function createComponent() {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        { provide: TRAILROAM_DATABASE, useValue: { verno: 3 } },
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: {
            activities: { clear: vi.fn().mockResolvedValue(undefined) },
            activityRoutes: { clear: vi.fn().mockResolvedValue(undefined) },
            syncState: { clear: vi.fn().mockResolvedValue(undefined) },
            syncHistory: { clear: vi.fn().mockResolvedValue(undefined) },
            settings: { get: vi.fn() },
            accessState: { get: vi.fn() },
          },
        },
        { provide: ConfirmService, useValue: { confirm: vi.fn().mockResolvedValue(true) } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: SyncHistoryService, useValue: { record: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(undefined) } },
        { provide: LocalDataService, useValue: { clearSyncedLocalData: vi.fn().mockResolvedValue(undefined), backup: vi.fn().mockResolvedValue({ settings: [], accessState: [], syncState: [], activities: [], activityRoutes: [], exportedAt: '2024-01-01T00:00:00.000Z' }), validateBackup: vi.fn(), restore: vi.fn().mockResolvedValue({ settingsCount: 0, accessStateCount: 0, syncStateCount: 0, activitiesCount: 0, activityRoutesCount: 0 }) } },
      ],
    });
    return TestBed.createComponent(SettingsPage);
  }

  it('should create', () => {
    const fixture = createComponent();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should detect outdated DB version', () => {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        { provide: TRAILROAM_DATABASE, useValue: { verno: 1 } },
        { provide: TRAILROAM_REPOSITORIES, useValue: {} },
        { provide: ConfirmService, useValue: { confirm: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: SyncHistoryService, useValue: { list: vi.fn().mockResolvedValue([]) } },
        { provide: LocalDataService, useValue: { clearSyncedLocalData: vi.fn().mockResolvedValue(undefined) } },
      ],
    });
    const cmp = TestBed.createComponent(SettingsPage).componentInstance;
    expect((cmp as any).dbOutdated).toBe(true);
  });

  it('should display limited sync history by default', () => {
    const cmp = TestBed.createComponent(SettingsPage).componentInstance as any;
    expect(cmp.displayedHistory()).toEqual([]);
    expect(cmp.showViewFull()).toBe(false);
  });

  it('should format triggers correctly', () => {
    const cmp = TestBed.createComponent(SettingsPage).componentInstance as any;
    expect(cmp.formatTrigger('sync_new_activities')).toBe('Sync activities');
    expect(cmp.formatTrigger('sync_missing_routes')).toBe('Sync missing routes');
    expect(cmp.formatTrigger('clear_synced_local_data')).toBe('Clear synced local data');
    expect(cmp.formatTrigger('unknown_trigger')).toBe('unknown_trigger');
  });
});

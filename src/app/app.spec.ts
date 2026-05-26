import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { ActivitiesPage, MapPage, SettingsPage, routes } from './app.routes';
import { LocalDataService } from './storage/local-data.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render primary navigation', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = [...compiled.querySelectorAll('nav a')].map((link) => link.textContent?.trim());
    expect(links).toEqual(['Activities', 'Map', 'Settings']);
  });

  it('should render header sync action slot', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const syncButton = compiled.querySelector<HTMLButtonElement>('.sync-menu-trigger');

    expect(compiled.querySelector('.brand')?.textContent).toContain('Trailroam for Strava');
    expect(compiled.querySelector('.header-actions')).toBeTruthy();
    expect(syncButton?.textContent).toContain('Sync new activities');
    expect(syncButton?.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('should show login required state after sync is requested', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.sync-menu-trigger')?.click();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.sync-status')?.textContent).toContain('Login required');
    expect(compiled.querySelector('.session-alert')?.textContent).toContain('Please log in to Strava first.');
    expect(compiled.querySelector('.session-alert')?.textContent).toContain('Open Strava');
    expect(compiled.querySelector('.session-alert')?.textContent).toContain('Retry');
  });
});

describe('ActivitiesPage', () => {
  it('should render no data state', () => {
    TestBed.configureTestingModule({
      imports: [ActivitiesPage],
    });

    const fixture = TestBed.createComponent(ActivitiesPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state')?.textContent).toContain('No activities yet');
    expect(compiled.querySelector('.empty-state')?.textContent).toContain('Sync new activities');
  });
});

describe('MapPage', () => {
  function configureMapPage(queryParams: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap(queryParams)),
          },
        },
      ],
    });
  }

  it('should render no route state', () => {
    configureMapPage();

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state')?.textContent).toContain('No routes yet');
    expect(compiled.querySelector('.empty-state')?.textContent).toContain('Sync new activities');
  });

  it('should render basemap error state', () => {
    configureMapPage({ basemapError: 'true' });

    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.warning-state')?.textContent).toContain('Basemap unavailable');
    expect(compiled.querySelector('.warning-state')?.textContent).toContain('local activities and routes are unaffected');
  });
});

describe('SettingsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function configureSettingsPage(clearSyncedLocalData = vi.fn().mockResolvedValue(undefined)): void {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        {
          provide: LocalDataService,
          useValue: {
            clearSyncedLocalData,
          },
        },
      ],
    });
  }

  it('should render clear synced local data action', () => {
    configureSettingsPage();

    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.danger-state')?.textContent).toContain('Clear synced local data');
    expect(compiled.querySelector('.danger-state')?.textContent).toContain('Settings and access state are kept');
  });

  it('should ask for confirmation before clearing synced local data', async () => {
    const clearSyncedLocalData = vi.fn().mockResolvedValue(undefined);
    configureSettingsPage(clearSyncedLocalData);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.danger-action')?.click();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledWith(
      'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
    );
    expect(clearSyncedLocalData).not.toHaveBeenCalled();
  });

  it('should clear synced local data and update status after confirmation', async () => {
    const clearSyncedLocalData = vi.fn().mockResolvedValue(undefined);
    configureSettingsPage(clearSyncedLocalData);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.danger-action')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(clearSyncedLocalData).toHaveBeenCalledOnce();
    expect(compiled.querySelector('[role="status"]')?.textContent).toContain(
      'Imported activities, routes, and sync state were cleared.',
    );
  });
});

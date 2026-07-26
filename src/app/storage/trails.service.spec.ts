import { TestBed } from '@angular/core/testing';
import { TrailsService } from './trails.service';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import type { TrailRecord } from './storage.models';

function createMockTrail(overrides: Partial<TrailRecord> = {}): TrailRecord {
  const now = new Date().toISOString();
  return {
    id: 'trail:test-1',
    name: 'Test Trail',
    activityIds: ['strava:1', 'strava:2'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockTrailsApi(trails: TrailRecord[]) {
  return {
    list: vi.fn().mockResolvedValue(trails),
    put: vi.fn().mockImplementation((t: TrailRecord) => Promise.resolve(t.id)),
    get: vi
      .fn()
      .mockImplementation((id: string) => Promise.resolve(trails.find((t) => t.id === id))),
    delete: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(trails.length),
    clear: vi.fn().mockResolvedValue(undefined),
    updateName: vi.fn().mockImplementation((id: string, name: string) => {
      const existing = trails.find((t) => t.id === id);
      if (!existing) return Promise.resolve(undefined);
      return Promise.resolve({ ...existing, name, updatedAt: new Date().toISOString() });
    }),
    updateActivityIds: vi.fn().mockImplementation((id: string, activityIds: string[]) => {
      const existing = trails.find((t) => t.id === id);
      if (!existing) return Promise.resolve(undefined);
      return Promise.resolve({ ...existing, activityIds, updatedAt: new Date().toISOString() });
    }),
    findByActivityId: vi.fn().mockImplementation((activityId: string) => {
      return Promise.resolve(trails.find((t) => t.activityIds.includes(activityId)));
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockActivitiesApi(activityIds: string[]) {
  return {
    list: vi.fn().mockResolvedValue(
      activityIds.map((id) => ({
        id,
        provider: 'strava' as const,
        providerActivityId: id.replace('strava:', ''),
        name: `Activity ${id}`,
        sportType: 'Ride',
        activityCategory: 'ride' as const,
        startDate: new Date().toISOString(),
        hasRoute: true,
        routeSyncStatus: 'route_synced' as const,
        importedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    ),
    get: vi.fn(),
    put: vi.fn(),
    upsert: vi.fn(),
    updateRouteSyncStatus: vi.fn(),
    updateName: vi.fn(),
    updateMetadata: vi.fn(),
    count: vi.fn(),
    countWithRouteSyncStatus: vi.fn(),
    clear: vi.fn(),
    delete: vi.fn(),
    listPage: vi.fn(),
  };
}

describe('TrailsService', () => {
  let service: TrailsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let trailsApi: ReturnType<typeof createMockTrailsApi>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activitiesApi: ReturnType<typeof createMockActivitiesApi>;

  function createMockRepos(
    trails: TrailRecord[],
    activityIds: string[] = ['strava:1', 'strava:2', 'strava:3'],
  ) {
    trailsApi = createMockTrailsApi(trails);
    activitiesApi = createMockActivitiesApi(activityIds);
    return {
      trails: trailsApi,
      activities: activitiesApi,
      activityRoutes: {} as any,
      routeGeometry: {} as any,
      syncState: {} as any,
      syncHistory: {} as any,
      settings: {} as any,
      accessState: {} as any,
      savedPlaces: {} as any,
    };
  }

  function initService(trails: TrailRecord[], activityIds?: string[]) {
    const repos = createMockRepos(trails, activityIds);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [TrailsService, { provide: TRAILROAM_REPOSITORIES, useValue: repos }],
    });
    service = TestBed.inject(TrailsService);
    return repos;
  }

  beforeEach(() => {
    initService([]);
  });

  describe('load()', () => {
    it('loads trails from storage into the signal', async () => {
      const trail = createMockTrail();
      initService([trail]);
      await service.load();
      expect(service.trails()).toHaveLength(1);
      expect(service.trails()[0].name).toBe('Test Trail');
    });

    it('sets empty array on load failure', async () => {
      trailsApi.list.mockRejectedValue(new Error('DB error'));
      await service.load();
      expect(service.trails()).toEqual([]);
    });
  });

  describe('create()', () => {
    it('creates a trail and adds it to the signal', async () => {
      initService([]);
      await service.load();
      const result = await service.create('New Trail', ['strava:1', 'strava:2']);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('New Trail');
      expect(result!.activityIds).toEqual(['strava:1', 'strava:2']);
      expect(service.trails()).toHaveLength(1);
    });

    it('returns null when fewer than 2 activities are provided', async () => {
      const result = await service.create('Lone Activity', ['strava:1']);
      expect(result).toBeNull();
    });

    it('returns null when activity already belongs to another trail', async () => {
      const existing = createMockTrail({ activityIds: ['strava:1', 'strava:5'] });
      initService([existing]);
      await service.load();
      const result = await service.create('Conflict', ['strava:1', 'strava:2']);
      expect(result).toBeNull();
    });
  });

  describe('rename()', () => {
    it('renames a trail and updates the signal', async () => {
      const trail = createMockTrail();
      initService([trail]);
      await service.load();
      await service.rename(trail.id, 'Renamed Trail');
      expect(service.trails()[0].name).toBe('Renamed Trail');
    });
  });

  describe('remove()', () => {
    it('deletes a trail and removes it from the signal', async () => {
      const trail = createMockTrail();
      initService([trail]);
      await service.load();
      await service.remove(trail.id);
      expect(service.trails()).toHaveLength(0);
    });
  });

  describe('addToTrail()', () => {
    it('adds an activity to a trail', async () => {
      const trail = createMockTrail({ activityIds: ['strava:1', 'strava:3'] });
      initService([trail]);
      await service.load();
      const ok = await service.addToTrail(trail.id, 'strava:2');
      expect(ok).toBe(true);
      expect(service.trails()[0].activityIds).toContain('strava:2');
    });

    it('returns false when trail does not exist', async () => {
      const ok = await service.addToTrail('trail:ghost', 'strava:1');
      expect(ok).toBe(false);
    });
  });

  describe('removeFromTrail()', () => {
    it('removes an activity from a trail', async () => {
      const trail = createMockTrail({ activityIds: ['strava:1', 'strava:2', 'strava:3'] });
      initService([trail]);
      await service.load();
      const action = await service.removeFromTrail(trail.id, 'strava:3');
      expect(action).toBe('removed');
      expect(service.trails()[0].activityIds).toEqual(['strava:1', 'strava:2']);
    });

    it('dissolves the trail when only 1 activity would remain', async () => {
      const trail = createMockTrail({ activityIds: ['strava:1', 'strava:2'] });
      initService([trail]);
      await service.load();
      const action = await service.removeFromTrail(trail.id, 'strava:2');
      expect(action).toBe('dissolved');
      expect(service.trails()).toHaveLength(0);
    });
  });

  describe('findForActivity()', () => {
    it('finds the trail containing an activity', () => {
      const trail = createMockTrail();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any)._trails.set([trail]);
      expect(service.findForActivity('strava:1')?.id).toBe(trail.id);
      expect(service.findForActivity('strava:99')).toBeUndefined();
    });
  });

  describe('allTrailedActivityIds()', () => {
    it('returns all activity IDs across all trails', () => {
      const trail1 = createMockTrail({ id: 'trail:a', activityIds: ['s:1', 's:2'] });
      const trail2 = createMockTrail({ id: 'trail:b', activityIds: ['s:3', 's:4'] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any)._trails.set([trail1, trail2]);
      const ids = service.allTrailedActivityIds();
      expect(ids.size).toBe(4);
      expect(ids.has('s:1')).toBe(true);
      expect(ids.has('s:4')).toBe(true);
    });
  });

  describe('dissolveOrphaned (via load)', () => {
    it('dissolves trails where referenced activities have disappeared', async () => {
      const trail = createMockTrail({
        activityIds: ['strava:1', 'strava:999'],
      });
      initService([trail], ['strava:1', 'strava:2', 'strava:3']);
      await service.load();
      // Only 1 valid activity remains → trail should be dissolved
      expect(service.trails()).toHaveLength(0);
      expect(trailsApi.delete).toHaveBeenCalledWith(trail.id);
    });

    it('preserves trails where all referenced activities exist', async () => {
      const trail = createMockTrail({
        activityIds: ['strava:1', 'strava:2'],
      });
      initService([trail], ['strava:1', 'strava:2', 'strava:3']);
      await service.load();
      expect(service.trails()).toHaveLength(1);
      expect(service.trails()[0].activityIds).toEqual(['strava:1', 'strava:2']);
    });
  });
});

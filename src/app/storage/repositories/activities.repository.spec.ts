import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { TrailroamDatabase } from '../db';
import { ActivitiesRepository } from './activities.repository';
import type { ActivityRecord } from '../storage.models';

function makeActivity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  const now = new Date().toISOString();
  return {
    id: 'strava:1',
    provider: 'strava',
    providerActivityId: '1',
    name: 'Morning Ride',
    sportType: 'Ride',
    activityCategory: 'ride',
    startDate: '2025-01-01T08:00:00.000Z',
    distanceMeters: 25000,
    movingTimeSeconds: 3600,
    hasRoute: false,
    routeSyncStatus: 'not_attempted',
    importedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ActivitiesRepository', () => {
  let db: TrailroamDatabase;
  let repo: ActivitiesRepository;

  beforeEach(async () => {
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    db = new TrailroamDatabase(`trailroam_test_activities_${Date.now()}_${Math.random()}`);
    await db.open();
    repo = new ActivitiesRepository(db);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  describe('upsert()', () => {
    it('inserts a new activity and reports inserted: true', async () => {
      const result = await repo.upsert(makeActivity());

      expect(result.inserted).toBe(true);
      expect(result.activity.id).toBe('strava:1');
      expect(await repo.get('strava:1')).toBeDefined();
    });

    it('updates an existing activity and reports inserted: false', async () => {
      await repo.put(makeActivity({ name: 'Old Name' }));

      const result = await repo.upsert(makeActivity({ name: 'New Name' }));

      expect(result.inserted).toBe(false);
      expect((await repo.get('strava:1'))!.name).toBe('New Name');
    });

    it('preserves hasRoute from the existing record on update', async () => {
      await repo.put(makeActivity({ hasRoute: true, routeSyncStatus: 'route_synced' }));

      const incoming = makeActivity({ hasRoute: false, routeSyncStatus: 'not_attempted', name: 'Updated' });
      await repo.upsert(incoming);

      const stored = await repo.get('strava:1');
      expect(stored!.hasRoute).toBe(true);
      expect(stored!.routeSyncStatus).toBe('route_synced');
    });

    it('preserves routeSyncStatus from the existing record on update', async () => {
      await repo.put(makeActivity({ routeSyncStatus: 'rate_limited' }));

      await repo.upsert(makeActivity({ routeSyncStatus: 'not_attempted' }));

      expect((await repo.get('strava:1'))!.routeSyncStatus).toBe('rate_limited');
    });

    it('preserves importedAt from the existing record on update', async () => {
      const originalImportedAt = '2025-01-01T00:00:00.000Z';
      await repo.put(makeActivity({ importedAt: originalImportedAt }));

      await repo.upsert(makeActivity({ importedAt: '2099-12-31T00:00:00.000Z', name: 'Updated' }));

      expect((await repo.get('strava:1'))!.importedAt).toBe(originalImportedAt);
    });

    it('refreshes updatedAt on update', async () => {
      await repo.put(makeActivity({ updatedAt: '2025-01-01T00:00:00.000Z' }));

      const result = await repo.upsert(makeActivity({ name: 'Updated' }));

      expect(result.activity.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('overwrites mutable fields (name, distance, sportType) on update', async () => {
      await repo.put(makeActivity({ name: 'Old', distanceMeters: 1000, sportType: 'Run' }));

      await repo.upsert(makeActivity({ name: 'New', distanceMeters: 5000, sportType: 'Ride' }));

      const stored = await repo.get('strava:1');
      expect(stored!.name).toBe('New');
      expect(stored!.distanceMeters).toBe(5000);
      expect(stored!.sportType).toBe('Ride');
    });
  });

  describe('updateRouteSyncStatus()', () => {
    it('sets hasRoute, routeSyncStatus and refreshes updatedAt', async () => {
      await repo.put(makeActivity({ updatedAt: '2025-01-01T00:00:00.000Z' }));

      await repo.updateRouteSyncStatus('strava:1', true, 'route_synced');

      const stored = await repo.get('strava:1');
      expect(stored!.hasRoute).toBe(true);
      expect(stored!.routeSyncStatus).toBe('route_synced');
      expect(stored!.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('updateStreamStats()', () => {
    it('writes only the provided stat keys', async () => {
      await repo.put(makeActivity());

      await repo.updateStreamStats('strava:1', {
        averageHeartrateBpm: 150,
        maxHeartrateBpm: 180,
      });

      const stored = await repo.get('strava:1');
      expect(stored!.averageHeartrateBpm).toBe(150);
      expect(stored!.maxHeartrateBpm).toBe(180);
    });

    it('skips undefined keys and does not erase previously-stored values', async () => {
      await repo.put(
        makeActivity({
          averageHeartrateBpm: 140,
          maxSpeedMetersPerSecond: 9,
          averageTemperatureCelsius: 20,
        }),
      );

      // maxHeartrateBpm is undefined here — averageHeartrateBpm and the others must survive.
      await repo.updateStreamStats('strava:1', {
        averageHeartrateBpm: 150,
        maxHeartrateBpm: undefined,
        minHeartrateBpm: 120,
      });

      const stored = await repo.get('strava:1');
      expect(stored!.averageHeartrateBpm).toBe(150);
      expect(stored!.minHeartrateBpm).toBe(120);
      // Untouched fields keep their values.
      expect(stored!.maxSpeedMetersPerSecond).toBe(9);
      expect(stored!.averageTemperatureCelsius).toBe(20);
      // The undefined key was not written as undefined.
      expect(stored!.maxHeartrateBpm).toBeUndefined();
    });

    it('refreshes updatedAt even when no stat keys are provided', async () => {
      await repo.put(makeActivity({ updatedAt: '2025-01-01T00:00:00.000Z' }));

      await repo.updateStreamStats('strava:1', {});

      const stored = await repo.get('strava:1');
      expect(stored!.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('updateMetadata()', () => {
    it('updates name, sportType and optional activityStatus', async () => {
      await repo.put(makeActivity({ name: 'Old', sportType: 'Run', activityStatus: 'completed' }));

      await repo.updateMetadata('strava:1', { name: 'New', sportType: 'Ride', activityStatus: 'planned' });

      const stored = await repo.get('strava:1');
      expect(stored!.name).toBe('New');
      expect(stored!.sportType).toBe('Ride');
      expect(stored!.activityStatus).toBe('planned');
    });
  });

  describe('count() & countWithRouteSyncStatus()', () => {
    it('counts all activities and filters by routeSyncStatus', async () => {
      await repo.put(makeActivity({ id: 'strava:1', routeSyncStatus: 'route_synced' }));
      await repo.put(makeActivity({ id: 'strava:2', routeSyncStatus: 'route_synced' }));
      await repo.put(makeActivity({ id: 'strava:3', routeSyncStatus: 'no_route' }));

      expect(await repo.count()).toBe(3);
      expect(await repo.countWithRouteSyncStatus('route_synced')).toBe(2);
      expect(await repo.countWithRouteSyncStatus('no_route')).toBe(1);
      expect(await repo.countWithRouteSyncStatus('rate_limited')).toBe(0);
    });
  });
});

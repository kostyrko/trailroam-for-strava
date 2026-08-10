import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { TrailroamDatabase } from '../db';
import { ActivityRoutesRepository } from './activity-routes.repository';
import type { ActivityRouteRecord } from '../storage.models';

function makeRoute(overrides: Partial<ActivityRouteRecord> = {}): ActivityRouteRecord {
  const now = new Date().toISOString();
  return {
    activityId: 'strava:1',
    providerActivityId: '1',
    simplifiedCoordinates: [[10, 20], [11, 21]],
    simplifiedPointCount: 2,
    pointCount: 4,
    bounds: { west: 10, south: 20, east: 11, north: 21 },
    syncedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ActivityRoutesRepository', () => {
  let db: TrailroamDatabase;
  let repo: ActivityRoutesRepository;

  beforeEach(async () => {
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    db = new TrailroamDatabase(`trailroam_test_routes_${Date.now()}_${Math.random()}`);
    await db.open();
    repo = new ActivityRoutesRepository(db);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  describe('upsert()', () => {
    it('inserts a new route and reports inserted: true', async () => {
      const route = makeRoute();

      const result = await repo.upsert(route);

      expect(result.inserted).toBe(true);
      expect(result.route.activityId).toBe('strava:1');
      const stored = await repo.get('strava:1');
      expect(stored).toBeDefined();
      expect(stored!.pointCount).toBe(4);
    });

    it('updates an existing route and reports inserted: false', async () => {
      await repo.put(makeRoute({ pointCount: 4 }));

      const updated = makeRoute({ pointCount: 8 });
      const result = await repo.upsert(updated);

      expect(result.inserted).toBe(false);
      const stored = await repo.get('strava:1');
      expect(stored!.pointCount).toBe(8);
    });

    it('preserves the original syncedAt on update (does not overwrite with the new value)', async () => {
      const originalSyncedAt = '2025-01-01T00:00:00.000Z';
      await repo.put(makeRoute({ syncedAt: originalSyncedAt, updatedAt: originalSyncedAt }));

      const incoming = makeRoute({ syncedAt: '2099-12-31T00:00:00.000Z', pointCount: 8 });
      const result = await repo.upsert(incoming);

      expect(result.route.syncedAt).toBe(originalSyncedAt);
      const stored = await repo.get('strava:1');
      expect(stored!.syncedAt).toBe(originalSyncedAt);
    });

    it('refreshes updatedAt on update', async () => {
      const originalUpdatedAt = '2025-01-01T00:00:00.000Z';
      await repo.put(makeRoute({ updatedAt: originalUpdatedAt }));

      const result = await repo.upsert(makeRoute({ pointCount: 8 }));

      expect(result.route.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('overwrites simplifiedCoordinates and bounds on update', async () => {
      await repo.put(
        makeRoute({
          simplifiedCoordinates: [[10, 20]],
          simplifiedPointCount: 1,
          bounds: { west: 10, south: 20, east: 10, north: 20 },
        }),
      );

      const incoming = makeRoute({
        simplifiedCoordinates: [[10, 20], [11, 21], [12, 22]],
        simplifiedPointCount: 3,
        bounds: { west: 10, south: 20, east: 12, north: 22 },
      });
      await repo.upsert(incoming);

      const stored = await repo.get('strava:1');
      expect(stored!.simplifiedPointCount).toBe(3);
      expect(stored!.bounds).toEqual({ west: 10, south: 20, east: 12, north: 22 });
    });
  });

  describe('get()', () => {
    it('returns undefined for a missing activityId', async () => {
      await expect(repo.get('strava:ghost')).resolves.toBeUndefined();
    });
  });

  describe('count() & clear()', () => {
    it('counts stored routes and clears them', async () => {
      await repo.put(makeRoute({ activityId: 'strava:1' }));
      await repo.put(makeRoute({ activityId: 'strava:2' }));

      expect(await repo.count()).toBe(2);

      await repo.clear();
      expect(await repo.count()).toBe(0);
    });
  });

  describe('delete()', () => {
    it('removes a route by activityId', async () => {
      await repo.put(makeRoute({ activityId: 'strava:1' }));

      await repo.delete('strava:1');

      expect(await repo.get('strava:1')).toBeUndefined();
    });
  });
});

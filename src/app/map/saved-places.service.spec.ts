import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SavedPlacesService } from './saved-places.service';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import type { TrailroamRepositories } from '../storage/repositories';
import type { GeocodeResult } from './geocoding.service';
import type { SavedPlaceRecord } from '../storage/storage.models';

function makeRepoMock(stored: SavedPlaceRecord[] = []) {
  const store = [...stored];
  return {
    store,
    list: vi.fn(async () => [...store].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    put: vi.fn(async (rec: SavedPlaceRecord) => {
      const idx = store.findIndex((p) => p.id === rec.id);
      if (idx >= 0) {
        store[idx] = rec;
      } else {
        store.push(rec);
      }
      return rec.id;
    }),
    delete: vi.fn(async (id: string) => {
      const idx = store.findIndex((p) => p.id === id);
      if (idx >= 0) {
        store.splice(idx, 1);
      }
    }),
    updateEditable: vi.fn(async (id: string, changes: { name: string; notes?: string }) => {
      const idx = store.findIndex((p) => p.id === id);
      if (idx < 0) {
        return undefined;
      }
      const updated: SavedPlaceRecord = {
        ...store[idx],
        name: changes.name,
        notes: changes.notes,
        updatedAt: new Date().toISOString(),
      };
      store[idx] = updated;
      return updated;
    }),
    updateCoordinates: vi.fn(async (id: string, latitude: number, longitude: number) => {
      const idx = store.findIndex((p) => p.id === id);
      if (idx < 0) {
        return undefined;
      }
      const updated: SavedPlaceRecord = {
        ...store[idx],
        latitude,
        longitude,
        updatedAt: new Date().toISOString(),
      };
      store[idx] = updated;
      return updated;
    }),
    findByProviderId: vi.fn(async (providerId: string) =>
      store.find((p) => p.providerId === providerId),
    ),
    findWithinRadiusMeters: vi.fn(async (lat: number, lng: number, radius = 10) => {
      // Approximate match for the test fixtures below: treat close coordinates as duplicates.
      const close = store.find(
        (p) => Math.abs(p.latitude - lat) < 0.0002 && Math.abs(p.longitude - lng) < 0.0002,
      );
      return close;
    }),
  };
}

function mockResult(label: string, lng: number, lat: number, providerId?: string): GeocodeResult {
  const r: GeocodeResult = { label, center: [lng, lat] };
  if (providerId) {
    r.providerId = providerId;
  }
  return r;
}

describe('SavedPlacesService', () => {
  let repoMock: ReturnType<typeof makeRepoMock>;

  beforeEach(() => {
    repoMock = makeRepoMock();
    TestBed.configureTestingModule({
      providers: [
        SavedPlacesService,
        {
          provide: TRAILROAM_REPOSITORIES,
          useValue: { savedPlaces: repoMock } as unknown as TrailroamRepositories,
        },
      ],
    });
  });

  it('loads places from the repository into the signal (newest first)', async () => {
    const now = '2026-07-01T00:00:00.000Z';
    const older = makePlace('place:1', 'Old', '2026-05-01T00:00:00.000Z');
    const newer = makePlace('place:2', 'New', now, { createdAt: now });
    repoMock.store.push(older, newer);

    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    expect(service.places().map((p) => p.name)).toEqual(['New', 'Old']);
  });

  it('saves a new place, persists it, and updates the signal', async () => {
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    const saved = await service.save({
      name: 'Kraków',
      latitude: 50.0614,
      longitude: 19.9372,
      providerName: 'Kraków',
      secondaryLabel: 'Polska',
      providerId: 'R123',
    });

    expect(saved).not.toBeNull();
    expect(saved?.name).toBe('Kraków');
    expect(repoMock.put).toHaveBeenCalledOnce();
    expect(service.places()[0].name).toBe('Kraków');
  });

  it('refuses to create a duplicate (providerId match) and returns null', async () => {
    repoMock.store.push(
      makePlace('place:1', 'Kraków', '2026-05-01T00:00:00.000Z', { providerId: 'R123' }),
    );
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    const saved = await service.save({
      name: 'Kraków again',
      latitude: 50.0614,
      longitude: 19.9372,
      providerId: 'R123',
    });

    expect(saved).toBeNull();
    expect(repoMock.put).not.toHaveBeenCalled();
    expect(service.places()).toHaveLength(1);
  });

  it('refuses to create a duplicate by 10m proximity when no providerId is present', async () => {
    repoMock.store.push(
      makePlace('place:1', 'Kraków', '2026-05-01T00:00:00.000Z', {
        latitude: 50.0614,
        longitude: 19.9372,
      }),
    );
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    const saved = await service.save({
      name: 'Near Kraków',
      latitude: 50.06143,
      longitude: 19.93723,
    });

    expect(saved).toBeNull();
    expect(service.places()).toHaveLength(1);
  });

  it('isAlreadySaved reflects the duplicate state for a search result (center is [lng, lat])', async () => {
    repoMock.store.push(
      makePlace('place:1', 'Kraków', '2026-05-01T00:00:00.000Z', { providerId: 'R123' }),
    );
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    expect(await service.isAlreadySaved(mockResult('Kraków', 19.9372, 50.0614, 'R123'))).toBe(true);
    expect(await service.isAlreadySaved(mockResult('Warsaw', 21.0122, 52.2297, 'N999'))).toBe(
      false,
    );
  });

  it('removes a place by id and updates the signal', async () => {
    repoMock.store.push(makePlace('place:1', 'Kraków', '2026-05-01T00:00:00.000Z'));
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    await service.remove('place:1');

    expect(repoMock.delete).toHaveBeenCalledWith('place:1');
    expect(service.places()).toHaveLength(0);
  });

  it('updates the name and notes of a place and reflects it in the signal', async () => {
    repoMock.store.push(
      makePlace('place:1', 'Kraków', '2026-05-01T00:00:00.000Z', { notes: 'old notes' }),
    );
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    const updated = await service.update('place:1', {
      name: 'Kraków centre',
      notes: 'meet at dawn',
    });

    expect(updated?.name).toBe('Kraków centre');
    expect(updated?.notes).toBe('meet at dawn');
    const inSignal = service.places().find((p) => p.id === 'place:1');
    expect(inSignal?.name).toBe('Kraków centre');
    expect(inSignal?.notes).toBe('meet at dawn');
  });

  it('stores empty notes as undefined on update', async () => {
    repoMock.store.push(
      makePlace('place:1', 'Kraków', '2026-05-01T00:00:00.000Z', { notes: 'old notes' }),
    );
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    const updated = await service.update('place:1', { name: 'Kraków', notes: '   ' });

    expect(updated?.notes).toBeUndefined();
  });

  it('returns null when updating a non-existent place', async () => {
    const service = TestBed.inject(SavedPlacesService);
    await service.load();

    const updated = await service.update('place:missing', { name: 'X', notes: '' });

    expect(updated).toBeNull();
  });

  describe('reposition', () => {
    it('updates the coordinates of a place and refreshes the signal', async () => {
      repoMock.store.push(
        makePlace('place:1', 'Kraków', '2026-05-01T00:00:00.000Z', {
          latitude: 50.0614,
          longitude: 19.9372,
        }),
      );
      const service = TestBed.inject(SavedPlacesService);
      await service.load();

      await service.reposition('place:1', 50.062, 19.938);

      expect(repoMock.updateCoordinates).toHaveBeenCalledWith('place:1', 50.062, 19.938);
      const inSignal = service.places().find((p) => p.id === 'place:1');
      expect(inSignal?.latitude).toBe(50.062);
      expect(inSignal?.longitude).toBe(19.938);
    });

    it('does not throw when the place does not exist', async () => {
      repoMock.updateCoordinates = vi.fn().mockResolvedValue(undefined);
      const service = TestBed.inject(SavedPlacesService);
      await service.load();

      await expect(service.reposition('place:missing', 50.0, 19.0)).resolves.toBeUndefined();
    });
  });
});

function makePlace(
  id: string,
  name: string,
  createdAt: string,
  overrides: Partial<SavedPlaceRecord> = {},
): SavedPlaceRecord {
  return {
    id,
    name,
    latitude: 50.0614,
    longitude: 19.9372,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

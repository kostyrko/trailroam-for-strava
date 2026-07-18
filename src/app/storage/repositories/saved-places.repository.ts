import { TrailroamDatabase } from '../db';
import { SavedPlaceRecord } from '../storage.models';
import { haversineMeters } from '../../shared/formatters/geo-distance';

/** Default proximity (in metres) used when detecting duplicates by coordinates. */
export const DUPLICATE_PROXIMITY_METERS = 10;

export class SavedPlacesRepository {
  constructor(private readonly db: TrailroamDatabase) {}

  async put(place: SavedPlaceRecord): Promise<string> {
    return this.db.saved_places.put(place);
  }

  async get(id: string): Promise<SavedPlaceRecord | undefined> {
    return this.db.saved_places.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.saved_places.delete(id);
  }

  /**
   * Updates the editable fields of a saved place (name, notes) and refreshes `updatedAt`.
   * Coordinates, provider id, and timestamps are preserved. Returns the updated record.
   */
  async updateEditable(id: string, changes: { name: string; notes?: string }): Promise<SavedPlaceRecord | undefined> {
    const existing = await this.db.saved_places.get(id);
    if (!existing) { return undefined; }
    const updated: SavedPlaceRecord = {
      ...existing,
      name: changes.name,
      notes: changes.notes,
      updatedAt: new Date().toISOString(),
    };
    await this.db.saved_places.put(updated);
    return updated;
  }

  /** Newest first (ordered by `createdAt` descending). */
  async list(): Promise<SavedPlaceRecord[]> {
    return this.db.saved_places.orderBy('createdAt').reverse().toArray();
  }

  async count(): Promise<number> {
    return this.db.saved_places.count();
  }

  async clear(): Promise<void> {
    await this.db.saved_places.clear();
  }

  async findByProviderId(providerId: string): Promise<SavedPlaceRecord | undefined> {
    return this.db.saved_places.where('providerId').equals(providerId).first();
  }

  /**
   * Returns the first saved place within `radiusMeters` of the given coordinates, or undefined.
   * Uses a haversine check against all places (the saved-places set is small in MVP, so a linear
   * scan is simpler and avoids maintaining a geo index).
   */
  async findWithinRadiusMeters(
    latitude: number,
    longitude: number,
    radiusMeters = DUPLICATE_PROXIMITY_METERS,
  ): Promise<SavedPlaceRecord | undefined> {
    const all = await this.db.saved_places.toArray();
    return all.find(
      (p) => haversineMeters({ latitude: p.latitude, longitude: p.longitude }, { latitude, longitude }) <= radiusMeters,
    );
  }
}

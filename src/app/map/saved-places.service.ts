import { Injectable, inject, signal } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import type { SavedPlaceRecord } from '../storage/storage.models';
import { logger } from '../shared/logger';
import type { GeocodeResult } from './geocoding.service';

/** Input for creating a saved place from a search result (or a raw map location). */
export interface SavePlaceInput {
  /** Confirmed or custom user-facing name (already trimmed/validated by the caller). */
  name: string;
  /** Optional user notes. Empty/whitespace-only notes are stored as `undefined`. */
  notes?: string;
  latitude: number;
  longitude: number;
  /** Original provider result name, when the place came from a search. */
  providerName?: string;
  secondaryLabel?: string;
  providerId?: string;
}

/**
 * Orchestrates saved places: loads them from IndexedDB into a signal, and exposes create/remove
 * and duplicate-detection operations. UI components read the `places` signal; persistence goes
 * through the {@link SavedPlacesRepository} (Dexie), so saved places are covered by backup/restore.
 *
 * Coordinates are stored as decimal degrees (`latitude`, `longitude`). Search results carry their
 * center as `[lng, lat]` (MapLibre convention) — callers convert before passing it in.
 */
@Injectable({ providedIn: 'root' })
export class SavedPlacesService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  private readonly _places = signal<SavedPlaceRecord[]>([]);
  /** Newest-first list of saved places. Re-rendered into panel lists and map markers. */
  readonly places = this._places.asReadonly();

  /** Loads saved places from storage into the signal. Safe to call on init. */
  async load(): Promise<void> {
    try {
      const list = await this.repositories.savedPlaces.list();
      // TEMP diagnostic (always visible) — remove once marker rendering is verified.
      console.warn('[DIAG] SavedPlacesService.load', { loaded: list.length, first: list[0] });
      this._places.set(list);
    } catch (err) {
      logger.error('Failed to load saved places:', err);
      this._places.set([]);
    }
  }

  /**
   * Persists a new place and updates the signal. Returns the created record, or `null` if a
   * duplicate already exists (same providerId or within ~10m). Call {@link isAlreadySaved} first
   * to surface the "already saved" state in the UI before the user opens the save dialog.
   */
  async save(input: SavePlaceInput): Promise<SavedPlaceRecord | null> {
    const existing = await this.findDuplicate(input);
    if (existing) { return null; }

    const now = new Date().toISOString();
    const normalizedNotes = input.notes && input.notes.trim() !== '' ? input.notes.trim() : undefined;
    const record: SavedPlaceRecord = {
      id: this.deriveId(),
      name: input.name,
      notes: normalizedNotes,
      providerName: input.providerName,
      latitude: input.latitude,
      longitude: input.longitude,
      secondaryLabel: input.secondaryLabel,
      providerId: input.providerId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.repositories.savedPlaces.put(record);
      this._places.update((list) => [record, ...list]);
      return record;
    } catch (err) {
      logger.error('Failed to save place:', err);
      throw err;
    }
  }

  /** Removes a place by id and updates the signal. */
  async remove(id: string): Promise<void> {
    try {
      await this.repositories.savedPlaces.delete(id);
      this._places.update((list) => list.filter((p) => p.id !== id));
    } catch (err) {
      logger.error('Failed to remove saved place:', err);
      throw err;
    }
  }

  /**
   * Updates the editable fields (name, notes) of a saved place and refreshes the signal. Empty
   * notes are stored as `undefined` to keep records tidy. Returns the updated record, or `null`
   * if the place was not found.
   */
  async update(id: string, changes: { name: string; notes: string }): Promise<SavedPlaceRecord | null> {
    try {
      const normalizedNotes = changes.notes.trim() === '' ? undefined : changes.notes.trim();
      const updated = await this.repositories.savedPlaces.updateEditable(id, {
        name: changes.name,
        notes: normalizedNotes,
      });
      if (!updated) { return null; }
      this._places.update((list) => list.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      logger.error('Failed to update saved place:', err);
      throw err;
    }
  }

  /**
   * Returns true when `result` matches an already-saved place (by providerId or ~10m proximity).
   * Used by the search panel to show the "Saved" state instead of "Save place".
   */
  async isAlreadySaved(result: GeocodeResult): Promise<boolean> {
    return (await this.findDuplicateFromResult(result)) !== null;
  }

  /**
   * Finds the existing saved place that matches `input`, if any. Exposed so callers can focus the
   * existing marker when a duplicate save is attempted (PRD §9).
   */
  async findDuplicate(input: Pick<SavePlaceInput, 'providerId' | 'latitude' | 'longitude'>): Promise<SavedPlaceRecord | null> {
    if (input.providerId) {
      const byProvider = await this.repositories.savedPlaces.findByProviderId(input.providerId);
      if (byProvider) { return byProvider; }
    }
    return (await this.repositories.savedPlaces.findWithinRadiusMeters(input.latitude, input.longitude)) ?? null;
  }

  private async findDuplicateFromResult(result: GeocodeResult): Promise<SavedPlaceRecord | null> {
    // GeocodeResult.center is [lng, lat].
    const [lng, lat] = result.center;
    return this.findDuplicate({ providerId: result.providerId, latitude: lat, longitude: lng });
  }

  private deriveId(): string {
    const crypto = globalThis.crypto;
    if (crypto && typeof crypto.randomUUID === 'function') {
      return `place:${crypto.randomUUID()}`;
    }
    return `place:${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

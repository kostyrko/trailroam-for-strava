import { Injectable, inject, signal } from '@angular/core';
import { TRAILROAM_REPOSITORIES } from './repositories/repositories.token';
import type { TrailRecord, ActivityRecord } from './storage.models';
import { generateId } from '../shared/uuid';
import { logger } from '../shared/logger';

/**
 * Orchestrates Trails: loads them from IndexedDB into a signal, and exposes create/rename/remove
 * and membership operations. UI components read the `trails` signal; persistence goes through
 * the {@link TrailsRepository} (Dexie), so Trails are covered by backup/restore.
 *
 * Trails are purely an organisational layer. Activities remain independent — deleting a Trail
 * never deletes activities. An activity may belong to at most one Trail.
 */
@Injectable({ providedIn: 'root' })
export class TrailsService {
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);

  private readonly _trails = signal<TrailRecord[]>([]);
  /** Newest-first list of trails. */
  readonly trails = this._trails.asReadonly();

  /** Loads trails from storage into the signal. Safe to call on init. */
  async load(): Promise<void> {
    try {
      const list = await this.repositories.trails.list();
      // Validate: dissolve trails where referenced activities have disappeared or only 1 remains
      const valid = await this.dissolveOrphaned(list);
      this._trails.set(valid);
    } catch (err) {
      logger.error('Failed to load trails:', err);
      this._trails.set([]);
    }
  }

  /**
   * Creates a new Trail with the given name and activity IDs.
   * Activities are automatically ordered chronologically by startDate.
   * Returns the created TrailRecord, or null if fewer than 2 activities are provided.
   */
  async create(name: string, activityIds: string[]): Promise<TrailRecord | null> {
    const trimmed = name.trim();
    if (!trimmed || activityIds.length < 2) {
      return null;
    }

    // Verify no activity is already in another trail
    for (const id of activityIds) {
      const existing = await this.repositories.trails.findByActivityId(id);
      if (existing) {
        logger.warn(`Activity ${id} already belongs to trail ${existing.id}`);
        return null;
      }
    }

    const now = new Date().toISOString();
    const record: TrailRecord = {
      id: `trail:${generateId()}`,
      name: trimmed,
      activityIds, // caller should pre-sort chronologically
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.repositories.trails.put(record);
      this._trails.update((list) => [record, ...list]);
      return record;
    } catch (err) {
      logger.error('Failed to create trail:', err);
      throw err;
    }
  }

  /** Renames a trail and updates the signal. */
  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      const updated = await this.repositories.trails.updateName(id, trimmed);
      if (updated) {
        this._trails.update((list) => list.map((t) => (t.id === id ? updated : t)));
      }
    } catch (err) {
      logger.error('Failed to rename trail:', err);
      throw err;
    }
  }

  /** Deletes a trail. Activities are restored as standalone — they are NOT deleted. */
  async remove(id: string): Promise<void> {
    try {
      await this.repositories.trails.delete(id);
      this._trails.update((list) => list.filter((t) => t.id !== id));
    } catch (err) {
      logger.error('Failed to delete trail:', err);
      throw err;
    }
  }

  /**
   * Adds an activity ID to a trail. If the activity already belongs to another trail, returns
   * false. Updates the signal on success.
   */
  async addToTrail(trailId: string, activityId: string): Promise<boolean> {
    const trail = this._trails().find((t) => t.id === trailId);
    if (!trail) return false;

    // Check the activity isn't already in another trail
    const existing = await this.repositories.trails.findByActivityId(activityId);
    if (existing && existing.id !== trailId) return false;

    if (trail.activityIds.includes(activityId)) return true; // already present, no-op

    const updated = await this.repositories.trails.updateActivityIds(trailId, [
      ...trail.activityIds,
      activityId,
    ]);
    if (updated) {
      this._trails.update((list) => list.map((t) => (t.id === trailId ? updated : t)));
    }
    return true;
  }

  /**
   * Removes an activity ID from a trail. If only one activity would remain, the trail is
   * dissolved (auto-deleted). Returns the action taken: 'removed' | 'dissolved'.
   */
  async removeFromTrail(trailId: string, activityId: string): Promise<'removed' | 'dissolved'> {
    const trail = this._trails().find((t) => t.id === trailId);
    if (!trail) return 'removed';

    const updatedIds = trail.activityIds.filter((id) => id !== activityId);
    if (updatedIds.length < 2) {
      // Dissolve the trail
      await this.remove(trailId);
      return 'dissolved';
    }

    const updated = await this.repositories.trails.updateActivityIds(trailId, updatedIds);
    if (updated) {
      this._trails.update((list) => list.map((t) => (t.id === trailId ? updated : t)));
    }
    return 'removed';
  }

  /**
   * Finds the trail that contains the given activity ID, or undefined.
   */
  findForActivity(activityId: string): TrailRecord | undefined {
    return this._trails().find((t) => t.activityIds.includes(activityId));
  }

  /**
   * Returns a set of all activity IDs that belong to any trail.
   */
  allTrailedActivityIds(): Set<string> {
    const ids = new Set<string>();
    for (const trail of this._trails()) {
      for (const aid of trail.activityIds) {
        ids.add(aid);
      }
    }
    return ids;
  }

  /**
   * Checks all trails and dissolves those where referenced activities no longer exist or
   * only one activity remains. Returns the cleaned list.
   */
  private async dissolveOrphaned(trails: TrailRecord[]): Promise<TrailRecord[]> {
    const activeActivityIds = new Set((await this.repositories.activities.list()).map((a) => a.id));

    const valid: TrailRecord[] = [];
    for (const trail of trails) {
      const stillExists = trail.activityIds.filter((id) => activeActivityIds.has(id));
      if (stillExists.length >= 2) {
        if (stillExists.length !== trail.activityIds.length) {
          // Some activities disappeared — update
          const updated: TrailRecord = {
            ...trail,
            activityIds: stillExists,
            updatedAt: new Date().toISOString(),
          };
          await this.repositories.trails.put(updated);
          valid.push(updated);
        } else {
          valid.push(trail);
        }
      } else {
        // Only 0 or 1 activity remains — dissolve
        await this.repositories.trails.delete(trail.id);
      }
    }
    return valid;
  }
}

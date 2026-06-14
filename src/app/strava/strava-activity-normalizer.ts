import { Injectable } from '@angular/core';
import type { ActivityRecord } from '../storage/storage.models';
import type { StravaActivityResponse } from './strava-session.service';
import { mapSportTypeToCategory } from '../shared/activity-category';

@Injectable({
  providedIn: 'root',
})
export class StravaActivityNormalizer {
  normalize(raw: StravaActivityResponse): ActivityRecord {
    const now = new Date().toISOString();
    const providerActivityId = String(raw.id);
    const id = `strava:${providerActivityId}`;
    const sportType = raw.sport_type ?? raw.type ?? 'Unknown';
    const startDate = raw.start_time ?? raw.start_date;
    const startDateLocal = raw.start_date_local_raw !== undefined ? new Date(raw.start_date_local_raw * 1000).toISOString() : raw.start_date_local;

    const distanceMeters = (raw.distance_raw ?? raw.distance) !== undefined ? Number(raw.distance_raw ?? raw.distance) : undefined;
    const movingTimeSeconds = (raw.moving_time_raw ?? raw.moving_time) !== undefined ? Number(raw.moving_time_raw ?? raw.moving_time) : undefined;
    const elapsedTimeSeconds = (raw.elapsed_time_raw ?? raw.elapsed_time) !== undefined ? Number(raw.elapsed_time_raw ?? raw.elapsed_time) : undefined;
    const elevationGain = (raw.total_elevation_gain ?? raw.elevation_gain_raw) !== undefined ? Number(raw.total_elevation_gain ?? raw.elevation_gain_raw) : undefined;

    return {
      id,
      provider: 'strava',
      providerActivityId,
      name: raw.name,
      sportType,
      activityCategory: mapSportTypeToCategory(sportType),
      startDate,
      startDateLocal,
      distanceMeters: distanceMeters !== undefined && isNaN(distanceMeters) ? undefined : distanceMeters,
      movingTimeSeconds: movingTimeSeconds !== undefined && isNaN(movingTimeSeconds) ? undefined : movingTimeSeconds,
      elapsedTimeSeconds: elapsedTimeSeconds !== undefined && isNaN(elapsedTimeSeconds) ? undefined : elapsedTimeSeconds,
      totalElevationGainMeters: elevationGain !== undefined && isNaN(elevationGain) ? undefined : elevationGain,
      averageSpeedMetersPerSecond: raw.average_speed ?? undefined,
      averageHeartrateBpm: raw.average_heartrate ?? undefined,
      hasRoute: false,
      routeSyncStatus: 'not_attempted',
      sourceUrl: `https://www.strava.com/activities/${providerActivityId}`,
      importedAt: now,
      updatedAt: now,
    };
  }
}

import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export type SessionStatus = 'logged_in' | 'login_required' | 'unknown_error';

export interface StravaActivityResponse {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain?: number;
  average_speed?: number;
  average_heartrate?: number;
  has_heartrate?: boolean;
  /** @deprecated Use sport_type instead */
  type?: string;
  /** Fields from /athlete/training_activities (content script path) */
  start_time?: string;
  start_date_local_raw?: number;
  distance_raw?: number;
  moving_time_raw?: number;
  elapsed_time_raw?: number;
  elevation_gain_raw?: number;
}

export interface ActivityListParams {
  page: number;
  perPage: number;
  before?: number;
  after?: number;
}

export type ActivityFetchResult =
  | { success: true; activities: StravaActivityResponse[]; status: SessionStatus }
  | { success: false; errorCode: string; status: SessionStatus };

export interface RouteStreamsData {
  coordinates: [number, number][];
  elevations?: number[];
  cumulativeDistances?: number[];
  /** Per-sample heart rate (bpm). Absent when the activity has no HR data. */
  heartrate?: number[];
  /** Per-sample smoothed velocity (m/s). Source of max/avg speed. */
  velocitySmooth?: number[];
  /** Per-sample temperature (°C). Rarely recorded. */
  temp?: number[];
  /** Per-sample seconds since activity start. Used to time-weight averages. */
  timeStream?: number[];
}

export type RouteFetchResult =
  | { success: true } & RouteStreamsData
  | { success: false; errorCode: string }
  | { success: false; errorCode: 'NO_GPS_ROUTE' }
  | { success: false; errorCode: 'ACTIVITY_ROUTE_FETCH_FAILED' }
  | { success: false; errorCode: 'STRAVA_RATE_LIMITED'; retryAfterSeconds: number };

const STRAVA_ACTIVITIES_PATH = '/athlete/training/activities';
const STRAVA_STREAMS_PATH = '/api/v3/activities';

@Injectable({
  providedIn: 'root',
})
export class StravaSessionService {

  async checkSession(): Promise<SessionStatus> {
    const ext = (typeof globalThis !== 'undefined' ? (globalThis as any).chrome : undefined)
      ?? (typeof (window as any) !== 'undefined' ? (window as any).chrome : undefined);

    if (!ext?.runtime?.id) {
      return 'unknown_error';
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 300));
      }
      try {
        const result = await ext.runtime.sendMessage('CHECK_STRAVA_SESSION');
        if (result === 'logged_in' || result === 'login_required' || result === 'unknown_error') {
          return result;
        }
      } catch {
      }
    }

    return 'unknown_error';
  }

  async fetchActivityList(params: ActivityListParams): Promise<ActivityFetchResult> {
    const baseUrl = `${environment.stravaApiBase}${STRAVA_ACTIVITIES_PATH}`;
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params.page));
    searchParams.set('per_page', String(params.perPage));
    if (params.before !== undefined) {
      searchParams.set('before', String(params.before));
    }
    if (params.after !== undefined) {
      searchParams.set('after', String(params.after));
    }

    try {
      const response = await fetch(`${baseUrl}?${searchParams.toString()}`, { credentials: 'include' });

      if (response.status === 401 || response.status === 302) {
        return { success: false, errorCode: 'STRAVA_LOGIN_REQUIRED', status: 'login_required' };
      }

      const text = await response.text();
      const activities = this.parseActivityList(text);

      if (activities === null) {
        return { success: false, errorCode: 'ACTIVITY_LIST_FETCH_FAILED', status: 'logged_in' };
      }

      return { success: true, activities, status: 'logged_in' };
    } catch {
      return { success: false, errorCode: 'STRAVA_REQUEST_FAILED', status: 'unknown_error' };
    }
  }

  async fetchActivityRoute(activityId: number): Promise<RouteFetchResult> {
    const url = `${environment.stravaApiBase}${STRAVA_STREAMS_PATH}/${activityId}/streams?keys=latlng,altitude,distance,heartrate,velocity_smooth,temp,time&key_by_type=true`;

    try {
      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, errorCode: 'NO_GPS_ROUTE' };
        }
        if (response.status === 401) {
          return { success: false, errorCode: 'STRAVA_LOGIN_REQUIRED' };
        }
        if (response.status === 429) {
          const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
          return { success: false, errorCode: 'STRAVA_RATE_LIMITED', retryAfterSeconds: retryAfter };
        }
        return { success: false, errorCode: 'ACTIVITY_ROUTE_FETCH_FAILED' };
      }

      const data = await response.json();

      if (!data?.latlng || !Array.isArray(data.latlng.data) || data.latlng.data.length === 0) {
        return { success: false, errorCode: 'NO_GPS_ROUTE' };
      }

      const coordinates: [number, number][] = data.latlng.data.map(
        ([lat, lng]: [number, number]) => [lng, lat] as [number, number],
      );

      const elevations: number[] | undefined =
        data?.altitude && Array.isArray(data.altitude.data)
          ? data.altitude.data
          : undefined;

      const cumulativeDistances: number[] | undefined =
        data?.distance && Array.isArray(data.distance.data)
          ? data.distance.data
          : undefined;

      // Performance/sensor streams used to compute activity aggregates (HR avg/max/min,
      // max speed, avg temperature). Absent when the activity recorded no such data.
      const heartrate: number[] | undefined =
        data?.heartrate && Array.isArray(data.heartrate.data) ? data.heartrate.data : undefined;
      const velocitySmooth: number[] | undefined =
        data?.velocity_smooth && Array.isArray(data.velocity_smooth.data)
          ? data.velocity_smooth.data
          : undefined;
      const temp: number[] | undefined =
        data?.temp && Array.isArray(data.temp.data) ? data.temp.data : undefined;
      const timeStream: number[] | undefined =
        data?.time && Array.isArray(data.time.data) ? data.time.data : undefined;

      return {
        success: true,
        coordinates,
        elevations,
        cumulativeDistances,
        heartrate,
        velocitySmooth,
        temp,
        timeStream,
      };
    } catch {
      return { success: false, errorCode: 'ACTIVITY_ROUTE_FETCH_FAILED' };
    }
  }

  normalizeSessionError(error: unknown): string {
    if (error instanceof TypeError) {
      return 'STRAVA_REQUEST_FAILED';
    }
    if (error instanceof DOMException) {
      return 'STRAVA_REQUEST_FAILED';
    }
    return 'STRAVA_REQUEST_FAILED';
  }

  private parseActivityList(text: string): StravaActivityResponse[] | null {
    if (text.length === 0) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed?.data && Array.isArray(parsed.data)) {
        return parsed.data;
      }
      return null;
    } catch {
      return null;
    }
  }
}

function parseRetryAfter(header: string | null): number {
  if (!header) {
    return 60;
  }
  const seconds = Number(header);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds;
  }
  return 60;
}

import type { ActivityRecord } from '../storage/storage.models';

/**
 * Pure helpers for reducing Strava per-sample stream arrays into the scalar activity
 * stats stored on {@link ActivityRecord}. Streams are not uniformly sampled, so averages
 * are time-weighted (each sample weighted by the seconds elapsed since the previous
 * sample, read from the `time` stream) when a matching `time` array is available, and
 * fall back to a plain mean otherwise. All functions return `undefined` for empty or
 * non-finite input so absent sensor data degrades cleanly to "no value".
 */

/**
 * The performance streams carried alongside a route. Both the content-script path
 * (raw keyed object) and the Angular fetch path (`RouteStreamsData`) map onto this.
 */
export interface ActivityStreams {
  heartrate?: number[];
  velocitySmooth?: number[];
  temp?: number[];
  timeStream?: number[];
}

/**
 * Reduces the performance streams into the scalar activity-stat fields. Only fields
 * with usable data are included in the result, so spreading the result onto an
 * `ActivityRecord` never overwrites a previously-stored value with `undefined`.
 */
export function computeStreamStats(streams: ActivityStreams): Partial<Pick<ActivityRecord,
  'averageHeartrateBpm' | 'maxHeartrateBpm' | 'minHeartrateBpm' |
  'maxSpeedMetersPerSecond' | 'averageTemperatureCelsius'>> {
  const stats: Partial<Pick<ActivityRecord,
    'averageHeartrateBpm' | 'maxHeartrateBpm' | 'minHeartrateBpm' |
    'maxSpeedMetersPerSecond' | 'averageTemperatureCelsius'>> = {};

  if (streams.heartrate && streams.heartrate.length > 0) {
    const avg = timeWeightedMean(streams.heartrate, streams.timeStream);
    const max = streamMax(streams.heartrate);
    const min = streamMin(streams.heartrate);
    if (avg !== undefined) stats.averageHeartrateBpm = avg;
    if (max !== undefined) stats.maxHeartrateBpm = max;
    if (min !== undefined) stats.minHeartrateBpm = min;
  }

  if (streams.velocitySmooth && streams.velocitySmooth.length > 0) {
    const maxSpeed = streamMax(streams.velocitySmooth);
    if (maxSpeed !== undefined) stats.maxSpeedMetersPerSecond = maxSpeed;
  }

  if (streams.temp && streams.temp.length > 0) {
    const avgTemp = timeWeightedMean(streams.temp, streams.timeStream);
    if (avgTemp !== undefined) stats.averageTemperatureCelsius = avgTemp;
  }

  return stats;
}

/** Drops non-finite values (Strava occasionally emits null/NaN gaps in a stream). */
function filterFinite(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Mean of a stream, time-weighted by the matching `time` stream when possible. Returns
 * `undefined` when there is no usable data. Falls back to a simple mean when `times` is
 * missing or its length does not align with `values`.
 */
export function timeWeightedMean(values: number[] | undefined, times: number[] | undefined): number | undefined {
  if (!values || values.length === 0) return undefined;
  const v = filterFinite(values);
  if (v.length === 0) return undefined;

  if (times && times.length === values.length) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < v.length; i++) {
      // First sample's weight is the time elapsed to reach it from the start (t[i]).
      // Subsequent samples are weighted by the gap since the previous sample.
      const weight = i === 0 ? (times[i] > 0 ? times[i] : 0) : Math.max(0, times[i] - times[i - 1]);
      weightedSum += v[i] * weight;
      totalWeight += weight;
    }
    if (totalWeight > 0) return weightedSum / totalWeight;
  }
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Maximum of a stream, ignoring non-finite values. `undefined` when empty. */
export function streamMax(values: number[] | undefined): number | undefined {
  if (!values || values.length === 0) return undefined;
  const v = filterFinite(values);
  if (v.length === 0) return undefined;
  return Math.max(...v);
}

/** Minimum of a stream, ignoring non-finite values. `undefined` when empty. */
export function streamMin(values: number[] | undefined): number | undefined {
  if (!values || values.length === 0) return undefined;
  const v = filterFinite(values);
  if (v.length === 0) return undefined;
  return Math.min(...v);
}

import { describe, it, expect } from 'vitest';
import { timeWeightedMean, streamMax, streamMin, computeStreamStats } from './stream-stats';

describe('streamMax', () => {
  it('returns undefined for empty/undefined input', () => {
    expect(streamMax(undefined)).toBeUndefined();
    expect(streamMax([])).toBeUndefined();
  });

  it('returns the maximum value', () => {
    expect(streamMax([1, 5, 3, 2])).toBe(5);
    expect(streamMax([-1, -5, -3])).toBe(-1);
  });

  it('ignores non-finite values', () => {
    expect(streamMax([1, NaN, 5, Infinity, 3])).toBe(5);
  });
});

describe('streamMin', () => {
  it('returns undefined for empty/undefined input', () => {
    expect(streamMin(undefined)).toBeUndefined();
    expect(streamMin([])).toBeUndefined();
  });

  it('returns the minimum value', () => {
    expect(streamMin([1, 5, 3, 2])).toBe(1);
  });

  it('ignores non-finite values', () => {
    expect(streamMin([1, NaN, -5, Infinity, 3])).toBe(-5);
  });
});

describe('timeWeightedMean', () => {
  it('returns undefined for empty/undefined input', () => {
    expect(timeWeightedMean(undefined, undefined)).toBeUndefined();
    expect(timeWeightedMean([], [])).toBeUndefined();
  });

  it('computes a simple mean when no times are provided', () => {
    expect(timeWeightedMean([10, 20, 30], undefined)).toBeCloseTo(20);
  });

  it('falls back to simple mean when times length mismatches values', () => {
    expect(timeWeightedMean([10, 20, 30], [0, 10])).toBeCloseTo(20);
  });

  it('weights samples by elapsed time when times align', () => {
    // value 10 for 0-10s, value 30 for 10-40s → (10*10 + 30*30) / 40 = (100+900)/40 = 25
    const result = timeWeightedMean([10, 30], [0, 10]);
    // weights: sample0 = time[0]=0 → weight 0; sample1 = time[1]-time[0] = 10
    // weightedSum = 10*0 + 30*10 = 300; totalWeight = 10 → 30
    // (first sample carries no weight when time starts at 0)
    expect(result).toBeCloseTo(30);
  });

  it('weights three samples by their time deltas', () => {
    // values [100, 200, 300], times [0, 10, 30]
    // weights: s0 = 0 (start), s1 = 10, s2 = 20 → sum weights = 30
    // weightedSum = 100*0 + 200*10 + 300*20 = 0 + 2000 + 6000 = 8000 → 8000/30
    const result = timeWeightedMean([100, 200, 300], [0, 10, 30]);
    expect(result).toBeCloseTo(8000 / 30, 1);
  });

  it('ignores non-finite values', () => {
    expect(timeWeightedMean([10, NaN, 30], undefined)).toBeCloseTo(20);
  });
});

describe('computeStreamStats', () => {
  it('returns an empty object when no streams are provided', () => {
    expect(computeStreamStats({})).toEqual({});
  });

  it('computes HR avg/max/min from the heartrate stream', () => {
    const stats = computeStreamStats({ heartrate: [120, 140, 160, 150], timeStream: [0, 10, 20, 30] });
    expect(stats.maxHeartrateBpm).toBe(160);
    expect(stats.minHeartrateBpm).toBe(120);
    expect(stats.averageHeartrateBpm).toBeDefined();
    expect(stats.averageHeartrateBpm!).toBeGreaterThan(120);
    expect(stats.averageHeartrateBpm!).toBeLessThan(160);
  });

  it('computes max speed from velocity_smooth', () => {
    const stats = computeStreamStats({ velocitySmooth: [3.5, 5.2, 4.1, 6.0] });
    expect(stats.maxSpeedMetersPerSecond).toBe(6.0);
    // velocity without time only yields max, not avg — avg speed is not in the result
    expect(stats.averageHeartrateBpm).toBeUndefined();
  });

  it('computes average temperature from temp stream', () => {
    const stats = computeStreamStats({ temp: [18, 19, 21], timeStream: [0, 10, 20] });
    expect(stats.averageTemperatureCelsius).toBeDefined();
    expect(stats.averageTemperatureCelsius!).toBeGreaterThan(18);
    expect(stats.averageTemperatureCelsius!).toBeLessThan(21);
  });

  it('omits fields whose stream is absent (degrades cleanly)', () => {
    const stats = computeStreamStats({ heartrate: [120, 140] });
    expect(stats.averageHeartrateBpm).toBeDefined();
    expect(stats.maxSpeedMetersPerSecond).toBeUndefined();
    expect(stats.averageTemperatureCelsius).toBeUndefined();
  });
});

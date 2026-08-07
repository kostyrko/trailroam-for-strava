import { describe, it, expect } from 'vitest';
import {
  GRADIENT_BUCKETS,
  gradientBucketIndex,
  gradientColor,
} from './gradient-color';

describe('gradientBucketIndex', () => {
  it('returns 0 for descents and flat gradients', () => {
    expect(gradientBucketIndex(-20)).toBe(0);
    expect(gradientBucketIndex(-0.1)).toBe(0);
    expect(gradientBucketIndex(0)).toBe(0);
    expect(gradientBucketIndex(1.9)).toBe(0);
  });

  it('treats the threshold as the lower bound of the next bucket', () => {
    expect(gradientBucketIndex(2)).toBe(1);
    expect(gradientBucketIndex(5)).toBe(2);
    expect(gradientBucketIndex(8)).toBe(3);
    expect(gradientBucketIndex(12)).toBe(4);
    expect(gradientBucketIndex(16)).toBe(5);
    expect(gradientBucketIndex(20)).toBe(6);
  });

  it('clamps very steep gradients to the last bucket', () => {
    expect(gradientBucketIndex(21)).toBe(6);
    expect(gradientBucketIndex(50)).toBe(6);
    expect(gradientBucketIndex(1e6)).toBe(6);
  });

  it('falls back to bucket 0 for NaN', () => {
    expect(gradientBucketIndex(Number.NaN)).toBe(0);
  });
});

describe('gradientColor', () => {
  it('maps each bucket to its palette colour', () => {
    expect(gradientColor(1)).toBe(GRADIENT_BUCKETS[0]!.color);
    expect(gradientColor(3)).toBe(GRADIENT_BUCKETS[1]!.color);
    expect(gradientColor(6)).toBe(GRADIENT_BUCKETS[2]!.color);
    expect(gradientColor(10)).toBe(GRADIENT_BUCKETS[3]!.color);
    expect(gradientColor(14)).toBe(GRADIENT_BUCKETS[4]!.color);
    expect(gradientColor(18)).toBe(GRADIENT_BUCKETS[5]!.color);
    expect(gradientColor(25)).toBe(GRADIENT_BUCKETS[6]!.color);
  });

  it('renders descents in the easiest colour', () => {
    expect(gradientColor(-5)).toBe(GRADIENT_BUCKETS[0]!.color);
  });
});

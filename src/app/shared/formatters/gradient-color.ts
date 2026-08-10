/**
 * Gradient → colour mapping for elevation-profile line rendering.
 *
 * Pure and side-effect-free so it can be unit-tested in isolation and reused by
 * any elevation/gradient visualisation. Returns one of five discrete colours so
 * climbs are countable at a glance and a small fixed legend can describe the
 * ramp — green on flat/descent sections, red on steep climbs (Komoot-style).
 *
 * Buckets are ascending by `maxPercent`; a gradient falls into the first bucket
 * whose `maxPercent` it does not exceed. Negative gradients (descents) map to
 * the easiest bucket.
 */
export interface GradientBucket {
  /** Exclusive upper bound, in percent. Infinity for the last (steepest) bucket. */
  readonly maxPercent: number;
  readonly color: string;
  readonly label: string;
}

export const GRADIENT_BUCKETS: readonly GradientBucket[] = [
  { maxPercent: 2, color: '#3a9d5e', label: '0\u20132%' },
  { maxPercent: 5, color: '#a3c845', label: '2\u20135%' },
  { maxPercent: 8, color: '#e8a33d', label: '5\u20138%' },
  { maxPercent: 12, color: '#e15a2b', label: '8\u201312%' },
  { maxPercent: 16, color: '#c0392b', label: '12\u201316%' },
  { maxPercent: 20, color: '#8e1d22', label: '16\u201320%' },
  { maxPercent: Infinity, color: '#5c0f13', label: '20%+' },
];

/**
 * Index into {@link GRADIENT_BUCKETS} for the given gradient. Descents and very
 * gentle gradients return 0; very steep gradients return the last index.
 */
export function gradientBucketIndex(gradPercent: number): number {
  if (Number.isNaN(gradPercent)) { return 0; }
  for (let i = 0; i < GRADIENT_BUCKETS.length; i++) {
    if (gradPercent < GRADIENT_BUCKETS[i]!.maxPercent) { return i; }
  }
  return GRADIENT_BUCKETS.length - 1;
}

/** Convenience: the hex colour for the bucket the given gradient falls into. */
export function gradientColor(gradPercent: number): string {
  return GRADIENT_BUCKETS[gradientBucketIndex(gradPercent)]!.color;
}

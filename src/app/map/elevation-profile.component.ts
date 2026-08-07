import { Component, input, output, computed, signal } from '@angular/core';
import { GRADIENT_BUCKETS } from '../shared/formatters/gradient-color';

const CHART_WIDTH = 280;
const CHART_HEIGHT = 120;
const PADDING_LEFT = 36;
const PADDING_RIGHT = 8;
const PADDING_TOP = 6;
const PADDING_BOTTOM = 18;
const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
/** Hover tooltip box width (SVG units). Kept wide enough for "Xkm / Ym / ±Z%". */
const TOOLTIP_WIDTH = 108;
const TOOLTIP_HALF_WIDTH = TOOLTIP_WIDTH / 2;

@Component({
  selector: 'app-elevation-profile',
  templateUrl: './elevation-profile.component.html',
  styleUrl: './elevation-profile.component.scss',
})
export class ElevationProfileComponent {
  readonly elevations = input<number[] | undefined>(undefined);
  readonly cumulativeDistances = input<number[] | undefined>(undefined);
  readonly coordinates = input<[number, number][] | undefined>(undefined);
  readonly totalDistanceMeters = input<number | undefined>(undefined);
  readonly compact = input(false);

  readonly hoveredPosition = output<{ lng: number; lat: number } | null>();

  protected readonly Math = Math;
  protected readonly PADDING_LEFT = PADDING_LEFT;
  protected readonly PADDING_TOP = PADDING_TOP;
  protected readonly gradientBuckets = GRADIENT_BUCKETS;

  readonly crosshairX = signal<number | null>(null);
  readonly hoverElevation = signal<number | null>(null);
  readonly hoverDistance = signal<number | null>(null);
  readonly hoverGradient = signal<number | null>(null);

  protected readonly tooltipHalfWidth = TOOLTIP_HALF_WIDTH;
  /**
   * Clamped centre x for the hover tooltip box. The crosshair line follows the
   * true mouse position ({@link crosshairX}); the box slides inward so its
   * edges stay within the chart bounds and the label text is never clipped.
   */
  protected readonly tooltipX = computed<number | null>(() => {
    const cx = this.crosshairX();
    if (cx === null) { return null; }
    return Math.max(TOOLTIP_HALF_WIDTH, Math.min(CHART_WIDTH - TOOLTIP_HALF_WIDTH, cx));
  });

  protected readonly hasElevation = computed(() => {
    const els = this.elevations();
    return !!els && els.length > 1 && els.some((e) => e !== 0);
  });

  private readonly effectiveElevations = computed(() => {
    const els = this.elevations();
    if (els && els.length > 1) { return els; }
    return null;
  });

  private readonly effectiveDistances = computed(() => {
    const els = this.effectiveElevations();
    if (!els) { return null; }
    const dist = this.cumulativeDistances();
    if (dist && dist.length === els.length) { return dist; }
    const totalMeters = this.totalDistanceMeters() ?? 0;
    if (totalMeters > 0 && els.length > 1) {
      return Array.from({ length: els.length }, (_, i) => i * (totalMeters / (els.length - 1)));
    }
    return Array.from({ length: els.length }, (_, i) => i);
  });

  protected readonly yMin = computed(() => {
    const els = this.effectiveElevations();
    if (!els) { return 0; }
    const min = Math.min(...els);
    const max = Math.max(...els);
    if (max - min < 10) { return min - 2; }
    return min;
  });

  protected readonly yMinBase = computed(() => {
    const els = this.effectiveElevations();
    if (!els) { return 0; }
    return Math.min(...els);
  });

  protected readonly yMaxRaw = computed(() => {
    const els = this.effectiveElevations();
    if (!els) { return 0; }
    return Math.max(...els);
  });

  protected readonly yMax = computed(() => {
    const max = this.yMaxRaw();
    const min = this.yMinBase();
    const range = max - min;
    const mult = range < 100 ? 1.0 : range < 500 ? 0.5 : 0.1;
    const minStep = range < 100 ? 100 : range < 500 ? 200 : 300;
    const step = niceRound(Math.max(range * mult, minStep));
    const padded = min + Math.max(range + step, 100);
    return Math.ceil(padded / step) * step;
  });

  protected readonly yRange = computed(() => Math.max(this.yMax() - this.yMin(), 1));

  protected readonly midY = computed(() => PADDING_TOP + PLOT_HEIGHT / 2);

  protected readonly yTicks = computed(() => {
    const els = this.effectiveElevations();
    if (!els) { return []; }
    const yMin = this.yMin();
    const yMax = this.yMax();
    const yR = this.yRange();
    const values = [yMax, (yMin + yMax) / 2, yMin];
    const seen = new Set<number>();
    return values
      .filter((v) => {
        const rounded = Math.round(v);
        if (seen.has(rounded)) { return false; }
        seen.add(rounded);
        return true;
      })
      .map((v) => ({
        value: v,
        label: `${Math.round(v)}`,
        y: PADDING_TOP + (1 - (v - yMin) / yR) * PLOT_HEIGHT,
      }));
  });

  protected readonly xTicks = computed(() => {
    const dist = this.effectiveDistances();
    if (!dist || dist.length < 2) { return []; }
    const totalMeters = dist[dist.length - 1];
    if (totalMeters <= 0) { return []; }
    const numTicks = 4;
    const step = niceRound(totalMeters / numTicks);
    if (step <= 0) { return []; }
    const ticks: { value: number; label: string; x: number }[] = [];
    const maxDist = dist[dist.length - 1] || 1;
    for (let d = step; d <= totalMeters; d += step) {
      const x = PADDING_LEFT + (d / maxDist) * PLOT_WIDTH;
      const km = d / 1000;
      ticks.push({ value: d, label: `${km.toFixed(km < 1 ? 2 : 1)}`, x });
    }
    return ticks;
  });

  private readonly points = computed(() => {
    const els = this.effectiveElevations();
    const dists = this.effectiveDistances();
    if (!els || !dists) { return null; }

    const smoothed = smoothElevations(els, dists);
    // Smooth the per-point gradient too, so bucket boundaries don't flicker as
    // the raw gradient oscillates around a threshold (e.g. 4.9% ↔ 5.1%).
    const gradients = smoothGradients(smoothed, dists);

    const yR = this.yRange();
    const yMn = this.yMin();
    const maxDist = dists[dists.length - 1] || 1;
    return smoothed.map((el, i) => ({
      x: PADDING_LEFT + (dists[i] / maxDist) * PLOT_WIDTH,
      y: PADDING_TOP + (1 - (el - yMn) / yR) * PLOT_HEIGHT,
      gradient: gradients[i] ?? 0,
    }));
  });

  /**
   * Per-bucket coloured line + fill segments. Consecutive segments share their
   * boundary point (the end of one is the start of the next) so round line caps
   * join without gaps and the area fills tile seamlessly along the baseline.
   * Empty when there is no elevation data.
   */
  protected readonly elevationSegments = computed<{ line: string; fill: string; color: string }[]>(() => {
    const pts = this.points();
    if (!pts || pts.length < 2) { return []; }

    const segments: { line: string; fill: string; color: string }[] = [];
    let start = 0;
    for (let i = 1; i < pts.length; i++) {
      const prevBucket = gradientBucketIndexOf(pts[start]!.gradient);
      const curBucket = gradientBucketIndexOf(pts[i]!.gradient);
      if (curBucket !== prevBucket) {
        segments.push(buildPath(pts, start, i, prevBucket));
        start = i;
      }
    }
    segments.push(buildPath(pts, start, pts.length - 1, gradientBucketIndexOf(pts[start]!.gradient)));
    return segments;
  });

  protected onMouseMove(event: MouseEvent): void {
    const pts = this.points();
    const dists = this.effectiveDistances();
    if (!pts || !dists || pts.length < 2) { return; }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const svgX = (mouseX / rect.width) * CHART_WIDTH;
    const clampedX = Math.max(PADDING_LEFT, Math.min(CHART_WIDTH - PADDING_RIGHT, svgX));

    const fraction = (clampedX - PADDING_LEFT) / PLOT_WIDTH;
    const targetDist = fraction * dists[dists.length - 1];

    const idx = binarySearch(dists, targetDist);
    const t = idx < dists.length - 1
      ? ((targetDist - dists[idx]) / (dists[idx + 1] - dists[idx]))
      : 0;

    const interpY = pts[idx].y + ((pts[idx + 1]?.y ?? pts[idx].y) - pts[idx].y) * Math.max(0, Math.min(1, t));
    const interpEl = idx < dists.length - 1
      ? this.effectiveElevations()![idx] + (this.effectiveElevations()![idx + 1] - this.effectiveElevations()![idx]) * Math.max(0, Math.min(1, t))
      : this.effectiveElevations()![idx];
    const interpGrad = idx < pts.length - 1
      ? pts[idx]!.gradient + ((pts[idx + 1]?.gradient ?? pts[idx]!.gradient) - pts[idx]!.gradient) * Math.max(0, Math.min(1, t))
      : pts[idx]!.gradient;

    this.crosshairX.set(clampedX);
    this.hoverElevation.set(interpEl);
    this.hoverDistance.set(targetDist);
    this.hoverGradient.set(interpGrad);

    const routeCoords = this.coordinates();
    if (routeCoords && routeCoords.length === dists.length) {
      const lng = routeCoords[idx][0] + ((routeCoords[idx + 1]?.[0] ?? routeCoords[idx][0]) - routeCoords[idx][0]) * Math.max(0, Math.min(1, t));
      const lat = routeCoords[idx][1] + ((routeCoords[idx + 1]?.[1] ?? routeCoords[idx][1]) - routeCoords[idx][1]) * Math.max(0, Math.min(1, t));
      this.hoveredPosition.emit({ lng, lat });
    } else {
      this.hoveredPosition.emit(null);
    }
  }

  protected onMouseLeave(): void {
    this.crosshairX.set(null);
    this.hoverElevation.set(null);
    this.hoverDistance.set(null);
    this.hoverGradient.set(null);
    this.hoveredPosition.emit(null);
  }
}

export function smoothElevations(elevations: number[], distances: number[]): number[] {
  const n = elevations.length;
  if (n < 4) { return elevations; }

  const totalDist = distances[distances.length - 1];
  const pointsPerKm = n / (totalDist / 1000);

  const WINDOW_MAX = 51;
  const WINDOW_MIN = 3;
  const rawWindow = Math.round(pointsPerKm * 0.15);
  const windowSize = Math.max(WINDOW_MIN, Math.min(WINDOW_MAX, rawWindow));

  const half = Math.floor(windowSize / 2);
  const result: number[] = [];

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += elevations[j];
      count++;
    }
    result.push(sum / count);
  }

  return result;
}

interface ProfilePoint {
  x: number;
  y: number;
  gradient: number;
}

/**
 * Per-point gradient (%) between consecutive smoothed-elevation points, then
 * moving-average-smoothed with the same distance-aware window as
 * {@link smoothElevations} so bucket boundaries stay stable. The last point
 * repeats the previous gradient (no following point to diff against).
 */
function smoothGradients(smoothedElevations: number[], distances: number[]): number[] {
  const n = smoothedElevations.length;
  if (n < 2) { return new Array(n).fill(0); }

  const raw: number[] = new Array(n);
  raw[0] = 0;
  for (let i = 1; i < n; i++) {
    const dDist = distances[i] - distances[i - 1];
    raw[i] = dDist > 0 ? ((smoothedElevations[i] - smoothedElevations[i - 1]) / dDist) * 100 : 0;
  }

  if (n < 4) { return raw; }

  const totalDist = distances[distances.length - 1];
  const pointsPerKm = n / (totalDist / 1000);
  const WINDOW_MAX = 51;
  const WINDOW_MIN = 3;
  const rawWindow = Math.round(pointsPerKm * 0.15);
  const windowSize = Math.max(WINDOW_MIN, Math.min(WINDOW_MAX, rawWindow));
  const half = Math.floor(windowSize / 2);

  const result: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n - 1, i + half);
    let sum = 0;
    for (let j = start; j <= end; j++) {
      sum += raw[j];
    }
    result[i] = sum / (end - start + 1);
  }
  return result;
}

/** Bucket index for a single point's gradient. Kept local to avoid extra imports in the hot loop. */
function gradientBucketIndexOf(gradPercent: number): number {
  if (Number.isNaN(gradPercent)) { return 0; }
  for (let i = 0; i < GRADIENT_BUCKETS.length; i++) {
    if (gradPercent < GRADIENT_BUCKETS[i]!.maxPercent) { return i; }
  }
  return GRADIENT_BUCKETS.length - 1;
}

/** Baseline (y of the chart bottom) that area fills close down to. */
const FILL_BASE_Y = CHART_HEIGHT - PADDING_BOTTOM;

/**
 * Builds the line `d` and the area-fill `d` for `pts[start..end]` (inclusive),
 * coloured by `bucket`. The line traces the top of the profile; the fill closes
 * that line down to the chart baseline. Consecutive segments share their
 * boundary point so the fills tile seamlessly along the shared vertical edge.
 */
function buildPath(
  pts: ProfilePoint[],
  start: number,
  end: number,
  bucket: number,
): { line: string; fill: string; color: string } {
  let line = `M${pts[start]!.x},${pts[start]!.y}`;
  for (let i = start + 1; i <= end; i++) {
    line += `L${pts[i]!.x},${pts[i]!.y}`;
  }
  // Fill: same top line, then drop to baseline at `end`, run back to `start`, close.
  const fill = `${line}L${pts[end]!.x},${FILL_BASE_Y}L${pts[start]!.x},${FILL_BASE_Y}Z`;
  return { line, fill, color: GRADIENT_BUCKETS[bucket]!.color };
}

export function niceRound(value: number): number {
  if (value <= 0) { return 0; }
  const exp = Math.floor(Math.log10(value));
  const mant = value / Math.pow(10, exp);
  let rounded: number;
  if (mant <= 1.5) { rounded = 1; } else if (mant <= 3.5) { rounded = 2; } else if (mant <= 7.5) { rounded = 5; } else { rounded = 10; }
  return rounded * Math.pow(10, exp);
}

export function niceScale(min: number, max: number, maxTicks: number): number[] {
  const range = max - min;
  if (range === 0) { return [min]; }
  const roughStep = range / maxTicks;
  const niceStep = niceRound(roughStep);
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const result: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
    result.push(v);
  }
  return result;
}

export function binarySearch(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) { lo = mid + 1; } else { hi = mid; }
  }
  return Math.max(0, lo - 1);
}

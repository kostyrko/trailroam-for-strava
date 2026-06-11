import { Component, input, output, computed, signal } from '@angular/core';

const CHART_WIDTH = 280;
const CHART_HEIGHT = 120;
const PADDING_LEFT = 36;
const PADDING_RIGHT = 8;
const PADDING_TOP = 6;
const PADDING_BOTTOM = 18;
const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

@Component({
  selector: 'app-elevation-profile',
  template: `
    <div class="elevation-chart-wrap" [class.elevation-compact]="compact()" (mousemove)="onMouseMove($event)" (mouseleave)="onMouseLeave()">
      <svg viewBox="0 0 280 120" class="elevation-svg" aria-label="Elevation profile chart">
        <line x1="36" [attr.y1]="120 - 18" x2="272" [attr.y2]="120 - 18" stroke="#dce6df" stroke-width="1" />
        <line x1="36" y1="6" x2="36" [attr.y2]="120 - 18" stroke="#dce6df" stroke-width="1" />
        @for (tick of yTicks(); track tick.value) {
          <line [attr.x1]="PADDING_LEFT - 3" [attr.y1]="tick.y" [attr.x2]="PADDING_LEFT" [attr.y2]="tick.y" stroke="#dce6df" stroke-width="1" />
          <text [attr.x]="PADDING_LEFT - 5" [attr.y]="tick.y + 3" text-anchor="end" fill="#63746a" font-size="8" font-family="system-ui, sans-serif">{{ tick.label }}</text>
        }
        @for (tick of xTicks(); track tick.value) {
          <line [attr.x1]="tick.x" y1="102" [attr.x2]="tick.x" y2="105" stroke="#dce6df" stroke-width="1" />
          <text [attr.x]="tick.x" y="116" text-anchor="middle" fill="#63746a" font-size="8" font-family="system-ui, sans-serif">{{ tick.label }}</text>
        }
        @if (hasElevation()) {
          <path [attr.d]="fillPath()" fill="#1f6f50" fill-opacity="0.12" />
          <path [attr.d]="linePath()" fill="none" stroke="#1f6f50" stroke-width="1.5" stroke-linejoin="round" />
        } @else {
          <line x1="36" [attr.y1]="midY()" x2="272" [attr.y2]="midY()" stroke="#cbd6cf" stroke-width="1.5" stroke-dasharray="4,3" />
          <text x="140" y="60" text-anchor="middle" fill="#a0b4a6" font-size="10" font-family="system-ui, sans-serif">No elevation data</text>
        }
        @if (crosshairX(); as cx) {
          <line [attr.x1]="cx" y1="6" [attr.x2]="cx" y2="102" stroke="#14211b" stroke-width="1" stroke-dasharray="3,2" />
          @if (hoverElevation(); as el) {
            <g>
              <rect [attr.x]="cx - 38" y="1" width="76" height="18" rx="3" fill="#14211b" fill-opacity="0.85" />
              @if (hoverDistance(); as dist) {
                <text [attr.x]="cx" y="13" text-anchor="middle" fill="#ffffff" font-size="9" font-family="system-ui, sans-serif" font-weight="600">{{ (dist / 1000).toFixed(1) }}km / {{ Math.round(el) }}m</text>
              } @else {
                <text [attr.x]="cx" y="14" text-anchor="middle" fill="#ffffff" font-size="9" font-family="system-ui, sans-serif" font-weight="600">{{ Math.round(el) }}m</text>
              }
            </g>
          }
        }
      </svg>
    </div>
  `,
  styles: [`
    .elevation-chart-wrap {
      cursor: crosshair;
      margin-top: 8px;
      width: 100%;
    }
    .elevation-svg {
      aspect-ratio: 280 / 120;
      display: block;
      overflow: visible;
      width: 100%;
    }
  `],
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

  readonly crosshairX = signal<number | null>(null);
  readonly hoverElevation = signal<number | null>(null);
  readonly hoverDistance = signal<number | null>(null);

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

    const yR = this.yRange();
    const yMn = this.yMin();
    const maxDist = dists[dists.length - 1] || 1;
    return smoothed.map((el, i) => ({
      x: PADDING_LEFT + (dists[i] / maxDist) * PLOT_WIDTH,
      y: PADDING_TOP + (1 - (el - yMn) / yR) * PLOT_HEIGHT,
    }));
  });

  protected readonly linePath = computed(() => {
    const pts = this.points();
    if (!pts || pts.length < 2) { return ''; }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  });

  protected readonly fillPath = computed(() => {
    const pts = this.points();
    if (!pts || pts.length < 2) { return ''; }
    const bottomY = CHART_HEIGHT - PADDING_BOTTOM;
    let d = `M${pts[0].x},${bottomY}`;
    for (const p of pts) {
      d += `L${p.x},${p.y}`;
    }
    d += `L${pts[pts.length - 1].x},${bottomY}Z`;
    return d;
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

    this.crosshairX.set(clampedX);
    this.hoverElevation.set(interpEl);
    this.hoverDistance.set(targetDist);

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
    this.hoveredPosition.emit(null);
  }
}

function smoothElevations(elevations: number[], distances: number[]): number[] {
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

function niceRound(value: number): number {
  if (value <= 0) { return 0; }
  const exp = Math.floor(Math.log10(value));
  const mant = value / Math.pow(10, exp);
  let rounded: number;
  if (mant <= 1.5) { rounded = 1; } else if (mant <= 3.5) { rounded = 2; } else if (mant <= 7.5) { rounded = 5; } else { rounded = 10; }
  return rounded * Math.pow(10, exp);
}

function niceScale(min: number, max: number, maxTicks: number): number[] {
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

function binarySearch(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) { lo = mid + 1; } else { hi = mid; }
  }
  return Math.max(0, lo - 1);
}
